import { studionet } from 'genlayer-js/chains';

export { studionet };

export const STUDIONET_CHAIN_ID_DEC = studionet.id;
export const STUDIONET_CHAIN_ID_HEX = `0x${studionet.id.toString(16)}`;

export const STUDIONET_CHAIN_CONFIG = {
  chainId: STUDIONET_CHAIN_ID_HEX,
  chainName: studionet.name,
  rpcUrls: [...studionet.rpcUrls.default.http],
  nativeCurrency: {
    name: studionet.nativeCurrency.name,
    symbol: studionet.nativeCurrency.symbol,
    decimals: studionet.nativeCurrency.decimals,
  },
  blockExplorerUrls: studionet.blockExplorers?.default?.url ? [studionet.blockExplorers.default.url] : ['https://studio.genlayer.com'],
};
