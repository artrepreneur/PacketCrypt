/*@flow*/
const Util = require('./Util.js');

/*::
export type Protocol_PcConfigJson_t = {
    currentHeight: number,
    masterUrl: string,
    submitAnnUrls: Array<string>,
    downloadAnnUrls: Array<string>,
    submitBlockUrls: Array<string>,
    annMinWork: number,
    shareMinWork: number
};

export type Protocol_RawBlockTemplate_t = {
    height: number,
    header: string,
    coinbase_no_witness: string,
    merklebranch: Array<string>,
    transactions: Array<string>
};
export type Protocol_Work_t = {
    height: number,
    coinbase_no_witness: Buffer,
    shareTarget: number,
    annTarget: number,
    header: Buffer,
    lastHash: Buffer,
    contentHash: Buffer,
    proof: Array<Buffer>,
    binary: Buffer,
};
*/

const bufferFromInt = (i) => {
    const b = Buffer.alloc(4);
    b.writeInt32LE(i, 0);
    return b;
};

const workEncode = module.exports.workEncode = (work /*:Protocol_Work_t*/) /*:Buffer*/ => {
    const height = bufferFromInt(work.height);
    const cnwlen = bufferFromInt(work.coinbase_no_witness.length);
    const shareTarget = bufferFromInt(work.shareTarget);
    const annTarget = bufferFromInt(work.annTarget);
    const merkles = Buffer.concat(work.proof);
    return Buffer.concat([
        work.header,
        work.contentHash,
        shareTarget,
        annTarget,
        height,
        cnwlen,
        work.coinbase_no_witness,
        merkles
    ]);
};

// 80 + 32 + 4 + 4 + 4 + 1024 + 1024
module.exports.workFromRawBlockTemplate = (
    x /*:Protocol_RawBlockTemplate_t*/,
    contentHash /*:Buffer*/,
    shareTarget /*:number*/,
    annTarget /*:number*/
) /*:Protocol_Work_t*/ => {
    const header = Util.bufFromHex(x.header);
    const out = {
        height: x.height,
        coinbase_no_witness: Util.bufFromHex(x.coinbase_no_witness),
        shareTarget: shareTarget,
        annTarget: annTarget,
        header: header,
        contentHash: contentHash,
        lastHash: header.slice(4, 4+32),
        proof: x.merklebranch.map(Util.bufFromHex),
        binary: Buffer.alloc(0),
    };
    out.binary = workEncode(out);
    return Object.freeze(out);
};

const workDecode = module.exports.workDecode = (work /*:Buffer*/) /*:Protocol_Work_t*/ => {
    let i = 0;
    const header = work.slice(i, i += 80);
    const contentHash = work.slice(i, i += 32);
    const shareTarget = work.readInt32LE(i); i += 4;
    const annTarget = work.readInt32LE(i); i += 4;
    const height = work.readInt32LE(i); i += 4;
    const cnwlen = work.readInt32LE(i); i += 4;
    const coinbase_no_witness = work.slice(i, i += cnwlen);
    const merkles = work.slice(i);
    const proof = [];
    for (let x = 0; x < merkles.length; x += 32) {
        proof.push(merkles.slice(x, x+32));
    }
    return Object.freeze({
        header: header,
        contentHash: contentHash,
        shareTarget: shareTarget,
        annTarget: annTarget,
        height: height,
        coinbase_no_witness: coinbase_no_witness,
        proof: proof,
        binary: work,
        lastHash: header.slice(4,36)
    });
};

module.exports.blockTemplateEncode = (rbt /*:Protocol_RawBlockTemplate_t*/) => {
    const out = rbt.transactions.map(Util.bufFromHex);
    out.unshift(Util.mkVarInt(rbt.transactions.length));
    out.unshift(Util.bufFromHex(rbt.header));
    return Buffer.concat(out);
};

/*
typedef struct AnnPost_s {
    uint32_t version;
    uint8_t hashNum;
    uint8_t hashMod;
    uint16_t _pad;
    Buf32_t contentHash;
    Buf32_t parentBlockHash;
    uint32_t minWork;
    uint32_t mostRecentBlock;
    PacketCrypt_Announce_t anns[IN_ANN_CAP];
} AnnPost_t;
typedef struct Result_s {
    uint32_t accepted;
    uint32_t duplicates;
    uint32_t invalid;
    uint8_t payTo[64];
} Result_t;
*/
/*::
export type Protocol_AnnPost_t = {
    version?: number,
    hashNum: number,
    hashMod: number,
    _pad?: number,
    contentHash: Buffer,
    parentBlockHash: Buffer,
    minWork: number,
    mostRecentBlock: number,
    payTo: string
};
export type Protocol_AnnResult_t = {
    accepted: number,
    duplicates: number,
    invalid: number,
    payTo: string
};
*/
module.exports.annPostEncode = (post /*:Protocol_AnnPost_t*/) => {
    const out = Buffer.alloc(4+1+1+2+32+32+4+4+64);
    let i = 0;
    if (post.version) { out.writeUInt32LE(post.version, i); } i += 4;
    out[i++] = post.hashNum;
    out[i++] = post.hashMod;
    if (post._pad) { out.writeUInt16LE(post._pad, i); } i += 2;
    post.contentHash.copy(out, i, 0, 32); i += 32;
    post.parentBlockHash.copy(out, i, 0, 32); i += 32;
    out.writeUInt32LE(post.minWork, i); i += 4;
    out.writeUInt32LE(post.mostRecentBlock, i); i += 4;
    Buffer.from(post.payTo, 'utf8').copy(out, i);
    return out;
};

module.exports.annResultDecode = (res /*:Buffer*/) /*:Protocol_AnnResult_t*/ => {
    return {
        accepted: res.readUInt32LE(0),
        duplicates: res.readUInt32LE(4),
        invalid: res.readUInt32LE(8),
        payTo: res.slice(12, res.indexOf(0, 12)).toString('utf8')
    };
};


/*
typedef struct ShareHeader_s {
    uint32_t version;
    uint8_t hashNum;
    uint8_t hashMod;
    uint16_t workLen;
    Buf32_t parentHashes[4];
    Buf64_t payTo;
} ShareHeader_t;
*/

/*::
export type Protocol_Share_t = {
    coinbaseCommit: Buffer,
    blockHeader: Buffer,
    packetCryptProof: Buffer
};
export type Protocol_ShareFile_t = {
    version: number,
    hashNum: number,
    hashMod: number,
    hashes: Array<Buffer>,
    payTo: string,
    work: Protocol_Work_t,
    share: Protocol_Share_t
};
*/
const shareEncode = module.exports.shareEncode = (share /*:Protocol_Share_t*/) => {
    return Buffer.concat([ share.coinbaseCommit, share.blockHeader, share.packetCryptProof ]);
};

const shareDecode = module.exports.shareDecode = (buf /*:Buffer*/) /*:Protocol_Share_t*/ => {
    const out = {};
    let i = 0;
    out.coinbaseCommit = buf.slice(i, (i += 32+8+4+4));
    out.blockHeader = buf.slice(i, (i += 80));
    out.packetCryptProof = buf.slice(i);
    return out;
};

module.exports.shareFileDecode = (buf /*:Buffer*/) /*:Protocol_ShareFile_t*/ => {
    const out = {};
    let x = 0;
    out.version = buf.readUInt32LE(x); x += 4;
    out.hashNum = buf[x++];
    out.hashMod = buf[x++];
    const workLen = buf.readUInt16LE(x); x += 2;
    out.hashes = [];
    for (let i = 0; i < 4; i++) {
        out.hashes[i] = buf.slice(x, (x += 32));
    }
    out.payTo = buf.slice(x, (x += 64)).toString('utf8');
    out.work = workDecode(buf.slice(x, (x += workLen)));
    out.share = shareDecode(buf.slice(x));
    return out;
};

module.exports.shareFileEncode = (share /*:Protocol_ShareFile_t*/) => {
    const shareBuf = shareEncode(share.share);
    const msg = Buffer.alloc(4+1+1+2+(32*share.hashes.length)+64+share.work.binary.length+shareBuf.length);
    let i = 0;
    msg.writeUInt32LE(0, i); i += 4;
    msg[i++] = share.hashNum;
    msg[i++] = share.hashMod;
    msg.writeUInt16LE(share.work.binary.length, i); i += 2;
    for (let x = 0; x < share.hashes.length; x++) {
        share.hashes[x].copy(msg, i);
        i += 32;
    }
    Buffer.from(share.payTo.slice(0,64), 'utf8').copy(msg, i); i += 64;
    share.work.binary.copy(msg, i); i += share.work.binary.length;
    shareBuf.copy(msg, i); i += shareBuf.length;
    if (i !== msg.length) { throw new Error(i + ' !== ' + msg.length); }
    return msg;
};

Object.freeze(module.exports);
