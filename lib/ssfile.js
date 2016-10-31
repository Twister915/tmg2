import config from '../config';
import Promise from 'bluebird';
import path from 'path';
import zlib from 'zlib';
import log from './log';
const fs = Promise.promisifyAll(require('fs'));

const ERRORS = {
    NOT_FOUND: {code: 404, message: "The requested upload could not be found"},
    BAD_FILE: {code: 404, message: "The requested upload had a bad file backing it up... :("},
}

const fileHeader = 0xFAFA;
const fileParts = {
    header: 2,
    remaining_length: 2,
    date_uploaded: 5,
    api_key_id: 1,
    string_length: 2,
}

/**
 * ALL VALUES ARE UNSIGNED, big endian
   string encoded in utf-8
    - 0xFAFA - HEADER [2 bytes]
    - 2 bytes for remaining length of header (excluding self)
    - date uploaded [int - 6 bytes]
    - API KEY ID [1 byte]
    - mime type - application/json, image/jpeg - [2 bytes for length, the string]
    - original name [2 bytes for length, the string]
    - binary gziped data [to end of file] 
 */

async function readFile(name) {
    let location = path.join(config.uploads_directory, name);
    try {
        await fs.statAsync(location)
    } catch (e) {
        throw ERRORS.NOT_FOUND;
    }

    let file = await fs.openAsync(location, 'r'); //open the file for reading
    
    let firstHeadLength = fileParts.header + fileParts.remaining_length; //get the length of the "first" header (has special bits, followed by length of rest of header)
    let buffer = Buffer.allocUnsafe(firstHeadLength); //the buffer to store this first part in
    await fs.readAsync(file, buffer, 0, firstHeadLength, 0); //await the read into my buffer

    var pos = 0;
    function getAndInc(amount) {
        let oldPos = pos;
        pos += amount;
        return oldPos;
    }
    if (buffer.readUIntBE(getAndInc(fileParts.header), fileParts.header) != fileHeader) //check to make sure the first section is equal to the special bits
        throw ERRORS.BAD_FILE;
    
    let restHeaderLength = buffer.readUIntBE(getAndInc(fileParts.remaining_length), fileParts.remaining_length);
    buffer = Buffer.allocUnsafe(restHeaderLength); //create a buffer for the rest of the header
    await fs.readAsync(file, buffer, 0, restHeaderLength, firstHeadLength);
    pos = 0;

    let dateUploaded = new Date(buffer.readUIntBE(getAndInc(fileParts.date_uploaded), fileParts.date_uploaded) * 1000);
    let apiKeyID = buffer.readUIntBE(getAndInc(fileParts.api_key_id), fileParts.api_key_id);
    let mimeType = readLengthPrefixedString(buffer, getAndInc);
    let originalName = readLengthPrefixedString(buffer, getAndInc);
    //should be end of buffer
    return {file, dateUploaded, apiKeyID, mimeType, originalName, filesize, stream: fs.createReadStream(null, {fd: file, start: consumed})};
}

function writeFile(dataStream, name, mimeType, apiKeyID) {
    return new Promise((resolve, reject) => {
        var url;
        createRandomName(config.url_length, config.uploads_directory).then(url0 => {
            url = url0;
            let location = path.join(config.uploads_directory, url);
            return fs.openAsync(location, 'wx');
        }).then(file => {
            let stream = fs.createWriteStream(null, {fd: file});

            //top header
            const endLength = fileParts.date_uploaded + fileParts.api_key_id + getLengthForString(mimeType) + getLengthForString(name);
            let headerBuffer = Buffer.allocUnsafe(fileParts.header + fileParts.remaining_length + endLength); 
            var pos = 0;
            function getAndInc(amount) {
                let oldPos = pos;
                pos += amount;
                return oldPos;
            }
            
            headerBuffer.writeUIntBE(fileHeader, getAndInc(fileParts.header), fileParts.header);
            headerBuffer.writeUIntBE(endLength, getAndInc(fileParts.remaining_length), fileParts.remaining_length);
            headerBuffer.writeUIntBE(Math.floor(Date.now() / 1000), getAndInc(fileParts.date_uploaded), fileParts.date_uploaded);
            headerBuffer.writeUIntBE(apiKeyID, getAndInc(fileParts.api_key_id), fileParts.api_key_id);
            writeLengthPrefixedString(mimeType, headerBuffer, getAndInc);
            writeLengthPrefixedString(name, headerBuffer, getAndInc);

            stream.write(headerBuffer);
            dataStream.pipe(zlib.createGzip()).pipe(stream);
            stream.on('finish', () => {
                log(`Wrote new file to ${url}`);
                resolve(url);
            });
        });
    });
}

function getLengthForString(str) {
    return fileParts.string_length + Buffer.byteLength(str, 'utf8');
}

function readLengthPrefixedString(buffer, gAI) {
    let len = buffer.readUIntBE(gAI(fileParts.string_length), fileParts.string_length);
    let start = gAI(len);
    return buffer.slice(start, start + len).toString('utf-8');
}

function writeLengthPrefixedString(str, buffer, gAI) {
    let len = Buffer.byteLength(str, 'utf8');
    buffer.writeUIntBE(len, gAI(fileParts.string_length), fileParts.string_length);
    buffer.write(str, gAI(len), 'utf8');
}

async function createRandomName(length, dir) {
    let name = createRandomString(length);
    try {
        await fs.statAsync(path.join(dir, name));
    } catch (e) {
        if (e.code == 'ENOENT')
            return name;
    }
    return createRandomName(length, dir);
}

const charPool = 'abcdefghkmnoprstwxzABCDEFGHJKLMNPQRTWXY34689';
function createRandomString(length) {
    if (length == 0) return '';
    return charPool.charAt(Math.random() * charPool.length) + createRandomString(length - 1);
}

export default {ERRORS, readFile, writeFile};