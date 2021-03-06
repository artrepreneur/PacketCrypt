/*@flow*/
const RpcClient = require('bitcoind-rpc');

/*::
import type { Protocol_RawBlockTemplate_t } from './Protocol.js';
export type Rpc_Client_Res_t<T> = {
    result: T,
    error: null,
    id: string
};
export type Rpc_Client_Request_t = {
    jsonrpc: "1.0"|"2.0",
    id: string,
    method: string,
    params: Array<any>
}
export type Rpc_BlockchainInfo_t = {
    chain: string,
    blocks: number,
    headers: number,
    bestblockhash: string,
    difficulty: number,
    mediantime: number,
    verificationprogress: number,
    initialblockdownload: bool,
    chainwork: string,
    size_on_disk: number,
    pruned: bool,
    softforks: Array<any>
};
export type Rpc_Transaction_t = {
    data: string,
    hash: string,
    depends: Array<number>,
    fee: number,
    sigops: number,
    weight: number
};
export type Rpc_BlockTemplate_t = {
    bits: string,
    curtime: number,
    height: number,
    previousblockhash: string,
    sigoplimit: number,
    sizelimit: number,
    weightlimit: number,
    transactions: Array<Rpc_Transaction_t>,
    version: number,
    coinbaseaux: {
        flags: string
    },
    coinbasevalue: number,
    default_witness_commitment: string,
    longpollid: string,
    submitold: boolean,
    target: string,
    maxtime: number,
    mintime: number,
    mutable: Array<"time"|"transactions/add"|"prevblock"|"coinbase/append">,
    noncerange: string,
    capabilities: Array<"proposal">
};
export type Rpc_Client_Rpc_t<T> = (err: ?Error, ret: ?Rpc_Client_Res_t<T>) => void;
export type Rpc_Client_t = {
    getBlockTemplate: (Rpc_Client_Rpc_t<Rpc_BlockTemplate_t>)=>void,
    getRawBlockTemplate: (Rpc_Client_Rpc_t<Protocol_RawBlockTemplate_t>)=>void,
    getBlockTemplateLongpoll: (longpollId: string, cb:Rpc_Client_Rpc_t<Rpc_BlockTemplate_t>)=>void,
    getBlockchainInfo: (Rpc_Client_Rpc_t<Rpc_BlockchainInfo_t>)=>void,

    batch: (()=>void, (err: ?Error, ret: ?Rpc_Client_Res_t<any>)=>void)=>void,
    batchedCalls: ?Rpc_Client_Request_t
};
export type Rpc_Config_t = {
    protocol: "http"|"https",
    user: string,
    pass: string,
    host: string,
    port: number,
    rejectUnauthorized: ?bool
};
*/

module.exports.create = (cfg /*:Rpc_Config_t*/) /*:Rpc_Client_t*/ => {
    const out = (new RpcClient(cfg)/*:Rpc_Client_t*/);
    out.getBlockTemplateLongpoll = (longPollId /*:string*/, cb) => {
        out.batch(() => {
            out.batchedCalls = {
                jsonrpc: "1.0",
                id: "packetcrypt",
                method: "getblocktemplate",
                params: [{
                    capabilities: ["longpoll"],
                    longpollid: longPollId
                }]
            };
        }, cb);
    };

    out.getRawBlockTemplate = (cb) => {
        out.batch(() => {
            out.batchedCalls = {
                jsonrpc: "1.0",
                id: "mantpool",
                method: "getrawblocktemplate",
                params: []
            };
        }, cb);
    };

    return out;
};
