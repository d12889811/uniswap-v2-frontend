import * as actions from "./actions";

export async function runPlan(plan, setLog, prompt) {
    console.log("🛠 Plan passed to runner:", plan);

    const steps = plan.map(s => ({
        name: s.name ?? s.action ?? s.func ?? s.functionName,
        args: s.args ?? s.arguments ?? s.params ?? {}
    }));

    let last = {};
    let poolAddress = null;

    for (const step of steps) {
        const fn = actions[step.name];
        if (!fn) {
            setLog(l => [...l, `⚠️ Undefined action: ${step.name}`]);
            continue;
        }

        // 🔁 替换 $变量
        for (const k in step.args) {
            if (typeof step.args[k] === "string" && step.args[k].startsWith("$")) {
                step.args[k] = last[step.args[k].slice(1)];
            }
        }

        // ✅ 自动补 poolAddress
        const needsPool = ["deposit", "redeem", "swap", "countActions", "getReserves"].includes(step.name);
        if (needsPool && !step.args.poolAddress) {
            step.args.poolAddress = poolAddress
                ?? (typeof window !== "undefined" ? window.selectedPool : null);
        }

        // ✅ 自动补默认日期（只针对 countSwaps）
        if (step.name === "countSwaps" && !step.args.date) {
            const today = new Date();
            const offset = today.getTimezoneOffset() * 60 * 1000;
            const localDate = new Date(today.getTime() - offset).toISOString().split("T")[0];
            step.args.date = localDate;
        }

        setLog(l => [...l, `▶ ${step.name} ${JSON.stringify(step.args)}`]);

        try {
            const result = await fn(step.args);
            setLog(l => [...l, `✅ [Result of ${step.name}]\n${JSON.stringify(result, null, 2)}`]);

            if (result.poolAddress) poolAddress = result.poolAddress;
            last = result;
        } catch (err) {
            setLog(l => [...l, `❌ ${step.name} failed: ${err.message}`]);
        }
    }

    const ret = { ...last, poolAddress };

    if (poolAddress && typeof window !== "undefined") {
        window.selectedPool = poolAddress;
        window.setSelectedPool?.(poolAddress);
        window.refreshPools?.();
    }

    return ret;
}
