#ifndef ANNOUNCE_H
#define ANNOUNCE_H

#include "packetcrypt/PacketCrypt.h"
#include "CryptoCycle.h"

#define Announce_ITEM_HASHCOUNT (sizeof(CryptoCycle_Item_t) / 64)

#define Announce_MERKLE_DEPTH 13

#define AnnMerkle_DEPTH Announce_MERKLE_DEPTH
#define AnnMerkle_NAME Announce_Merkle
#include "AnnMerkle.h"
_Static_assert(sizeof(Announce_Merkle_Branch) == (Announce_MERKLE_DEPTH+1)*64, "");
_Static_assert(sizeof(Announce_Merkle_Branch) == 896, "");

#define Announce_TABLE_SZ (1<<Announce_MERKLE_DEPTH)

#define Announce_lastAnnPfx_SZ \
    (1024 - sizeof(PacketCrypt_AnnounceHdr_t) - sizeof(Announce_Merkle_Branch))
_Static_assert(Announce_lastAnnPfx_SZ == 72, "");

typedef struct {
    PacketCrypt_AnnounceHdr_t hdr;
    Announce_Merkle_Branch merkleProof;
    uint8_t lastAnnPfx[Announce_lastAnnPfx_SZ];
} Announce_t;
_Static_assert(sizeof(Announce_t) == 1024, "");

union Announce_Union {
    PacketCrypt_Announce_t pcAnn;
    Announce_t ann;
};

void Announce_mkitem(uint64_t num, CryptoCycle_Item_t* item, uint8_t seed[static 32]);

#endif
