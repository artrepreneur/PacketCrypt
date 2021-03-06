#include "packetcrypt/Validate.h"
#include "Buf.h"
#include "Announce.h"
#include "packetcrypt/PacketCrypt.h"
#include "PacketCryptProof.h"
#include "CryptoCycle.h"
#include "Conf.h"
#include "Difficulty.h"
#include "Work.h"
#include "Util.h"

int Validate_checkAnn(
    uint8_t annHashOut[32],
    const PacketCrypt_Announce_t* pcAnn,
    const uint8_t* parentBlockHash,
    PacketCrypt_ValidateCtx_t* vctx)
{
    Announce_t _ann;
    Announce_t* ann = (Announce_t*) pcAnn;
    Buf_OBJCPY(&_ann.hdr, &ann->hdr);
    memcpy(&_ann.merkleProof.thirtytwos[0], parentBlockHash, 32);
    Buf_OBJSET(&_ann.merkleProof.thirtytwos[1], 0);
    Buf_OBJSET(_ann.hdr.softNonce, 0);

    Buf64_t annHash0;
    Hash_compress64(annHash0.bytes, (uint8_t*)&_ann,
        (sizeof _ann.hdr + sizeof _ann.merkleProof.sixtyfours[0]));

    Buf_OBJCPY(&_ann.merkleProof.sixtyfours[0], &ann->merkleProof.sixtyfours[13]);

    Buf64_t annHash1;
    Hash_compress64(annHash1.bytes, (uint8_t*)&_ann,
        (sizeof _ann.hdr + sizeof _ann.merkleProof.sixtyfours[0]));

    CryptoCycle_Item_t item;
    CryptoCycle_State_t state;
    uint32_t softNonce = 0;
    Buf_OBJCPY_LSRC(&softNonce, ann->hdr.softNonce);
    CryptoCycle_init(&state, &annHash1.thirtytwos[0], softNonce);
    int itemNo = -1;
    for (int i = 0; i < 4; i++) {
        itemNo = (CryptoCycle_getItemNo(&state) % Announce_TABLE_SZ);
        // only 32 bytes of the seed is used
        Announce_mkitem(itemNo, &item, annHash0.bytes);
        if (!CryptoCycle_update(&state, &item, Conf_AnnHash_RANDHASH_CYCLES, vctx->progbuf)) {
            return Validate_checkAnn_INVAL;
        }
    }

    _Static_assert(sizeof ann->lastAnnPfx == Announce_lastAnnPfx_SZ, "");
    if (memcmp(&item, ann->lastAnnPfx, sizeof ann->lastAnnPfx)) {
        return Validate_checkAnn_INVAL_ITEM4;
    }

    Buf64_t itemHash; Hash_COMPRESS64_OBJ(&itemHash, &item);
    if (!Announce_Merkle_isItemValid(&ann->merkleProof, &itemHash, itemNo)) {
        return Validate_checkAnn_INVAL;
    }

    uint32_t target = ann->hdr.workBits;
    CryptoCycle_final(&state);

    if (annHashOut) { memcpy(annHashOut, state.bytes, 32); }

    if (!Work_check(state.bytes, target)) { return Validate_checkAnn_INSUF_POW; }

    return Validate_checkAnn_OK;
}

static bool isWorkOk(const CryptoCycle_State_t* ccState,
                     const PacketCrypt_Coinbase_t* cb,
                     uint32_t target)
{
    uint32_t effectiveTarget = Difficulty_getEffectiveTarget(
        target, cb->annLeastWorkTarget, cb->numAnns);
    return Work_check(ccState->bytes, effectiveTarget);
}

// returns:
// Validate_checkBlock_OK
// Validate_checkBlock_SHARE_OK or
// Validate_checkBlock_INSUF_POW
static int checkPcHash(uint64_t indexesOut[PacketCrypt_NUM_ANNS],
                       const PacketCrypt_HeaderAndProof_t* hap,
                       const PacketCrypt_Coinbase_t* cb,
                       uint32_t shareTarget,
                       uint8_t workHashOut[static 32])
{
    CryptoCycle_State_t pcState;
    _Static_assert(sizeof(PacketCrypt_Announce_t) == sizeof(CryptoCycle_Item_t), "");

    Buf32_t hdrHash;
    Hash_COMPRESS32_OBJ(&hdrHash, &hap->blockHeader);
    CryptoCycle_init(&pcState, &hdrHash, hap->nonce2);
    for (int j = 0; j < 4; j++) {
        // This gets modded over the total anns in PacketCryptProof_hashProof()
        indexesOut[j] = CryptoCycle_getItemNo(&pcState);
        CryptoCycle_Item_t* it = (CryptoCycle_Item_t*) &hap->announcements[j];
        if (Util_unlikely(!CryptoCycle_update(&pcState, it, 0, NULL))) { return -1; }
    }
    CryptoCycle_smul(&pcState);
    CryptoCycle_final(&pcState);

    memcpy(workHashOut, pcState.bytes, 32);

    if (isWorkOk(&pcState, cb, hap->blockHeader.workBits)) {
        return Validate_checkBlock_OK;
    }

    if (shareTarget && isWorkOk(&pcState, cb, shareTarget)) {
        return Validate_checkBlock_SHARE_OK;
    }

    return Validate_checkBlock_INSUF_POW;
}

int Validate_checkBlock(const PacketCrypt_HeaderAndProof_t* hap,
                        uint32_t blockHeight,
                        uint32_t shareTarget,
                        const PacketCrypt_Coinbase_t* coinbaseCommitment,
                        const uint8_t blockHashes[static PacketCrypt_NUM_ANNS * 32],
                        uint8_t workHashOut[static 32],
                        PacketCrypt_ValidateCtx_t* vctx)
{
    if (coinbaseCommitment->magic != PacketCrypt_Coinbase_MAGIC) {
        return Validate_checkBlock_BAD_COINBASE;
    }
    if (!Difficulty_isMinAnnDiffOk(coinbaseCommitment->annLeastWorkTarget)) {
        return Validate_checkBlock_BAD_COINBASE;
    }

    // Check that final work result meets difficulty requirement
    uint64_t annIndexes[PacketCrypt_NUM_ANNS] = {0};
    int chk = checkPcHash(annIndexes, hap, coinbaseCommitment, shareTarget, workHashOut);

    Buf32_t annHashes[PacketCrypt_NUM_ANNS];

    // Validate announcements
    for (int i = 0; i < PacketCrypt_NUM_ANNS; i++) {
        const PacketCrypt_Announce_t* ann = &hap->announcements[i];
        if (Validate_checkAnn(NULL, ann, &blockHashes[i * 32], vctx)) {
            return Validate_checkBlock_ANN_INVALID(i);
        }
        uint32_t effectiveAnnTarget =
            Difficulty_degradeAnnouncementTarget(ann->hdr.workBits,
                (blockHeight - ann->hdr.parentBlockHeight));
        if (blockHeight < 3) { effectiveAnnTarget = ann->hdr.workBits; }
        if (effectiveAnnTarget > coinbaseCommitment->annLeastWorkTarget) {
            return Validate_checkBlock_ANN_INSUF_POW(i);
        }
        Hash_COMPRESS32_OBJ(&annHashes[i], ann);
    }

    // hash PacketCryptProof
    Buf32_t pcpHash;
    if (PacketCryptProof_hashProof(
        &pcpHash, annHashes, coinbaseCommitment->numAnns, annIndexes, hap->proof, hap->proofLen))
    {
        return Validate_checkBlock_PCP_INVAL;
    }

    // compare PacketCryptProof root hash to CoinbaseCommitment
    if (Buf_OBJCMP(&pcpHash, &coinbaseCommitment->merkleRoot)) {
        return Validate_checkBlock_PCP_MISMATCH;
    }

    return chk;
}
