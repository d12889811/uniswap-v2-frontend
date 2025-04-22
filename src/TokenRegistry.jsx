// 扫描链上出现的所有 token，生成 {symbol -> { address, name, decimals }}
import { ethers } from 'ethers';
import factoryAbi from './abis/UniswapV2Factory.json';
import pairAbi    from './abis/UniswapV2Pair.json';
import erc20Abi   from './abis/ERC20.json';

export async function buildTokenRegistry() {
    const provider = new ethers.JsonRpcProvider(import.meta.env.VITE_RPC_URL);
    const factory  = new ethers.Contract(
        import.meta.env.VITE_FACTORY_ADDRESS,
        factoryAbi,
        provider
    );
    const total = await factory.allPairsLength();
    const reg   = {};                       // 最终表

    for (let i = 0; i < total; i++) {
        const pairAddr = await factory.allPairs(i);
        const pair     = new ethers.Contract(pairAddr, pairAbi, provider);
        const [t0, t1] = [await pair.token0(), await pair.token1()];

        for (const addr of [t0, t1]) {
            if (Object.values(reg).some(t => t.address === addr)) continue; // 已录入
            const token = new ethers.Contract(addr, erc20Abi, provider);
            try {
                const [symbol, name, decimals] = await Promise.all([
                    token.symbol(),
                    token.name(),
                    token.decimals()
                ]);
                reg[symbol.toLowerCase()] = { address: addr, name, decimals };
            } catch { /* 测试币可能没实现 name()/decimals()，直接跳过 */ }
        }
    }
    return reg;
}
