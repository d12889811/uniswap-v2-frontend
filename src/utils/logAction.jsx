export function logAction({ type, poolAddress, token0, token1, amount0, amount1, txHash }) {
    const timestamp = new Date().toISOString();

    const entry = {
        type,
        timestamp,
        poolAddress,
        token0,
        token1,
        amount0,
        amount1,
        txHash: txHash || null
    };

    const logs = JSON.parse(localStorage.getItem("txLogs") || "[]");
    logs.push(entry);
    localStorage.setItem("txLogs", JSON.stringify(logs.slice(-100))); // keep latest 100
}
