// mxl-parser.js
// Minimal ZIP/MusicXML extraction for .mxl files used by Piano Trainer Studio.
// Parses the central directory of an MXL archive, picks the MusicXML entry
// (honoring META-INF/container.xml when present), and returns its text.
// No inflate support beyond store (0) and deflate (8). No dependencies.
//
// Public API:
//   window.MxlParser.extractMusicXml(rawData) -> Promise<string|null>
//
// rawData may be ArrayBuffer, TypedArray, Blob, or null. Returns null when
// the input cannot be turned into an ArrayBuffer.

(function () {
    'use strict';

    function readUint16LE(bytes, offset) {
        return bytes[offset] | (bytes[offset + 1] << 8);
    }

    function readUint32LE(bytes, offset) {
        return (
            bytes[offset] |
            (bytes[offset + 1] << 8) |
            (bytes[offset + 2] << 16) |
            (bytes[offset + 3] << 24)
        ) >>> 0;
    }

    function normalizeZipEntryPath(path) {
        return String(path || '').replace(/[\\/]+/g, '/').replace(/^\/+/, '');
    }

    function getZipEntryDepth(path) {
        const normalized = normalizeZipEntryPath(path);
        if (!normalized) return Number.MAX_SAFE_INTEGER;
        return normalized.split('/').length - 1;
    }

    async function rawDataToArrayBuffer(rawData) {
        if (rawData instanceof ArrayBuffer) return rawData;
        if (ArrayBuffer.isView(rawData)) {
            return rawData.buffer.slice(rawData.byteOffset, rawData.byteOffset + rawData.byteLength);
        }
        if (typeof Blob !== 'undefined' && rawData instanceof Blob) {
            return await rawData.arrayBuffer();
        }
        return null;
    }

    function listZipEntries(arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        const eocdSignature = 0x06054b50;
        const centralSignature = 0x02014b50;
        const minEocdSize = 22;
        const maxCommentLength = 0xffff;
        const searchStart = Math.max(0, bytes.length - (minEocdSize + maxCommentLength));

        let eocdOffset = -1;
        for (let offset = bytes.length - minEocdSize; offset >= searchStart; offset -= 1) {
            if (readUint32LE(bytes, offset) === eocdSignature) {
                eocdOffset = offset;
                break;
            }
        }

        if (eocdOffset < 0) {
            throw new Error('Could not find the ZIP directory in this MXL file.');
        }

        const entryCount = readUint16LE(bytes, eocdOffset + 10);
        const centralDirectoryOffset = readUint32LE(bytes, eocdOffset + 16);
        let offset = centralDirectoryOffset;
        const decoder = new TextDecoder('utf-8');
        const entries = [];

        for (let index = 0; index < entryCount; index += 1) {
            if (offset + 46 > bytes.length || readUint32LE(bytes, offset) !== centralSignature) {
                throw new Error('Could not read the ZIP entries from this MXL file.');
            }

            const compressionMethod = readUint16LE(bytes, offset + 10);
            const compressedSize = readUint32LE(bytes, offset + 20);
            const uncompressedSize = readUint32LE(bytes, offset + 24);
            const fileNameLength = readUint16LE(bytes, offset + 28);
            const extraFieldLength = readUint16LE(bytes, offset + 30);
            const fileCommentLength = readUint16LE(bytes, offset + 32);
            const localHeaderOffset = readUint32LE(bytes, offset + 42);
            const fileNameStart = offset + 46;
            const fileNameEnd = fileNameStart + fileNameLength;
            const fileName = decoder.decode(bytes.slice(fileNameStart, fileNameEnd));

            entries.push({
                fileName,
                compressionMethod,
                compressedSize,
                uncompressedSize,
                localHeaderOffset
            });

            offset = fileNameEnd + extraFieldLength + fileCommentLength;
        }

        return entries;
    }

    async function inflateZipEntryData(compressedBytes, compressionMethod) {
        if (compressionMethod === 0) {
            return compressedBytes;
        }

        if (compressionMethod !== 8) {
            throw new Error(`Unsupported MXL compression method: ${compressionMethod}.`);
        }

        if (typeof DecompressionStream !== 'function') {
            throw new Error('This browser does not support ZIP decompression for MXL files.');
        }

        const stream = new Blob([compressedBytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        const inflatedBuffer = await new Response(stream).arrayBuffer();
        return new Uint8Array(inflatedBuffer);
    }

    async function extractZipEntryText(arrayBuffer, entry) {
        const bytes = new Uint8Array(arrayBuffer);
        const localSignature = 0x04034b50;
        const localOffset = entry.localHeaderOffset;

        if (localOffset + 30 > bytes.length || readUint32LE(bytes, localOffset) !== localSignature) {
            throw new Error(`Could not read ZIP entry "${entry.fileName}".`);
        }

        const fileNameLength = readUint16LE(bytes, localOffset + 26);
        const extraFieldLength = readUint16LE(bytes, localOffset + 28);
        const dataStart = localOffset + 30 + fileNameLength + extraFieldLength;
        const dataEnd = dataStart + entry.compressedSize;
        const compressedBytes = bytes.slice(dataStart, dataEnd);
        const inflatedBytes = await inflateZipEntryData(compressedBytes, entry.compressionMethod);
        return new TextDecoder('utf-8').decode(inflatedBytes);
    }

    function chooseMusicXmlEntry(entries, containerPath = '') {
        const normalizedContainerPath = normalizeZipEntryPath(containerPath).toLowerCase();
        const xmlEntries = entries.filter((entry) => {
            const normalizedPath = normalizeZipEntryPath(entry.fileName);
            if (!normalizedPath) return false;
            if (normalizedPath.toLowerCase() === 'meta-inf/container.xml') return false;
            return /\.(xml|musicxml)$/i.test(normalizedPath);
        });

        if (!xmlEntries.length) return null;

        if (normalizedContainerPath) {
            const containerMatch = xmlEntries.find((entry) => normalizeZipEntryPath(entry.fileName).toLowerCase() === normalizedContainerPath);
            if (containerMatch) return containerMatch;
        }

        const rootLevelEntry = xmlEntries
            .filter((entry) => getZipEntryDepth(entry.fileName) === 0)
            .sort((left, right) => normalizeZipEntryPath(left.fileName).localeCompare(normalizeZipEntryPath(right.fileName)))[0];
        if (rootLevelEntry) return rootLevelEntry;

        return xmlEntries.sort((left, right) => {
            const depthDelta = getZipEntryDepth(left.fileName) - getZipEntryDepth(right.fileName);
            if (depthDelta !== 0) return depthDelta;
            return normalizeZipEntryPath(left.fileName).localeCompare(normalizeZipEntryPath(right.fileName));
        })[0];
    }

    async function extractMusicXml(rawData) {
        const arrayBuffer = await rawDataToArrayBuffer(rawData);
        if (!arrayBuffer) return null;

        const entries = listZipEntries(arrayBuffer);
        const containerEntry = entries.find((entry) => normalizeZipEntryPath(entry.fileName).toLowerCase() === 'meta-inf/container.xml');
        let containerPath = '';

        if (containerEntry) {
            try {
                const containerText = await extractZipEntryText(arrayBuffer, containerEntry);
                const match = containerText.match(/full-path\s*=\s*["']([^"']+)["']/i);
                if (match && match[1]) {
                    containerPath = match[1];
                }
            } catch (_) {}
        }

        const xmlEntry = chooseMusicXmlEntry(entries, containerPath);
        if (!xmlEntry) {
            throw new Error('Could not find the embedded MusicXML inside this MXL file.');
        }

        return await extractZipEntryText(arrayBuffer, xmlEntry);
    }

    window.MxlParser = {
        extractMusicXml,
        _internals: { normalizeZipEntryPath, getZipEntryDepth, listZipEntries, chooseMusicXmlEntry, rawDataToArrayBuffer }
    };
})();