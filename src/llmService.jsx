// src/llmService.js   (或你之前放 askForPlan 的文件)
export async function askForPlan(prompt, openaiKey) {
    /* 新增的两种工具 */
    const toolNames = [
        "selectPool", "createPool", "deposit", "redeem", "swap",
        "getReserves", "countSwaps"        // ★ 新增
    ];

    const sysPrompt =
        "You are an API caller.\n" +
        "Return ONLY a JSON array. Each element MUST be:\n" +
        '{ "name": "<selectPool|createPool|deposit|redeem|swap|getReserves|countActions>", "args": { ... } }.\n' +
        "NO code, NO explanations, NO markdown.\n" +
        "\n" +
        "👉 For `selectPool`:\n" +
        "- If user mentions a pool like 'ETH-USDC', 'USDT and WBTC', or 'AAA-BBB', add a `selectPool` step with:\n" +
        '    { "symbolA": "...", "symbolB": "..." } or { "poolId": "AAA-BBB" }\n' +
        "- If the user does NOT mention a pool, DO NOT include `selectPool` or `poolAddress`.\n" +
        "- NEVER guess or assume the poolAddress or token symbols yourself.\n" +
        "\n" +
        "👉 For `createPool`:\n" +
        "- Use when the user wants to create a new pool with two tokens.\n" +
        "- Return one step: { \"name\": \"createPool\", \"args\": { \"tokenA\": \"0x...\", \"tokenB\": \"0x...\" } }\n" +
        "- DO NOT guess addresses; only respond if the user gives two valid token addresses.\n" +
        "\n" +
        "👉 For `deposit`:\n" +
        "- Use when the user wants to add liquidity or provide tokens to a pool.\n" +
        "- Arguments: { \"amountA\": \"...\", \"amountB\": \"...\" }\n" +
        "- If only one amount is provided, set both amountA and amountB to that value.\n" +
        "- Requires pool selection. If pool is mentioned, use `selectPool` first.\n" +
        "\n" +
        "👉 For `redeem`:\n" +
        "- Use when the user wants to remove liquidity or withdraw their share.\n" +
        "- Argument: { \"percent\": \"...\" } — the percentage of their LP tokens to redeem.\n" +
        "- Must be a number between 1 and 100.\n" +
        "- If user says 'redeem all', use { \"percent\": \"100\" }.\n" +
        "- Requires pool selection. If pool is mentioned, use `selectPool` first.\n" +
        "\n" +
        "👉 For `swap`:\n" +
        "- Use `swap` when the user wants to exchange one token for another.\n" +
        "- Determine intent based on language:\n" +
        "\n" +
        "✅ Exact input (most common):\n" +
        "- User says: 'swap 10 TCA for TCB', 'swap 5 TokenA into TokenB', or 'give 8 DAI to get USDC'\n" +
        "→ Use: { \"fromSymbol\": \"TCA\", \"toSymbol\": \"TCB\", \"amount\": \"10\" }\n" +
        "\n" +
        "✅ Exact output:\n" +
        "- User says: 'I want to get 15 USDT by swapping ETH', or 'receive 6 TCB using TCA'\n" +
        "→ Use: { \"fromSymbol\": \"TCA\", \"toSymbol\": \"TCB\", \"amountOut\": \"6\" }\n" +
        "\n" +
        "- If the user provides both, include both `amount` and `amountOut`, and the system will prioritize `amount`.\n" +
        "- Do NOT assume token0/token1, just use the symbols as given.\n" +
        "- Requires pool selection. Use `selectPool` first if pool is mentioned.\n" +
        "- ⚠ NEVER confuse 'swap 10 A for B' with exact output — it is exact input.\n" +
        "\n" +
        "👉 For `getReserves`:\n" +
        "- Use this when the user asks about current reserves or token composition of a pool.\n" +
        "- If a pool is mentioned, use `selectPool` first, then call `getReserves` with { \"poolAddress\": \"$poolAddress\" }.\n" +
        "- If user says 'current pool' or 'selected pool', call `getReserves` with empty args: { }.\n" +
        "- DO NOT guess poolAddress or hardcode tokens.\n" +
        "\n" +
        "👉 For `countActions`:\n" +
        "- Use this when the user asks how many swaps, deposits, or redeems happened.\n" +
        "- Argument: { \"type\": \"swap\" | \"deposit\" | \"redeem\" }\n" +
        "- Optionally include \"date\": \"YYYY-MM-DD\".\n" +
        "- If a pool is mentioned, use `selectPool` first and pass poolAddress: \"$poolAddress\".\n" +
        "- If no pool is mentioned, omit poolAddress.\n" +
        "\n" +
        "⚠️ NEVER fabricate or assume any token symbols or pool addresses. Only act when user input makes it explicit.\n";






    const body = {
        model: "gpt-4o",
        messages: [
            { role: "system", content: sysPrompt },
            {
                role: "user",
                content:
                    "Note: I may or may not have selected a pool already. " +
                    "If I did not specify pool symbols or IDs explicitly, do NOT inject any pool-related parameters.\n\n" +
                    prompt.trim()
            }
        ]
    };

    /* ---------- 调用 OpenAI ---------- */
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method : "POST",
        headers: {
            "Content-Type" : "application/json",
            Authorization  : `Bearer ${openaiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        console.error("🚨 OpenAI error =", err);
        throw new Error(`OpenAI ${resp.status}: ${err.error?.message || resp.statusText}`);
    }

    const raw = (await resp.json()).choices?.[0]?.message?.content ?? "";
    console.log("📝 GPT‑raw reply ↓↓↓\n", raw);

    const cleaned = raw
        .trim()
        .replace(/^```json/i, "")
        .replace(/^```/, "")
        .replace(/```$/, "")
        .trim();

    /* ---------- 解析 JSON ---------- */
    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch {
        console.error("⚠ 解析 JSON 失败，cleaned 文本 =\n", cleaned);
        throw new Error("GPT‑4o 返回的不是合法 JSON；详见控制台");
    }

    const planArr = Array.isArray(parsed) ? parsed : parsed.plan;
    if (!Array.isArray(planArr)) {
        throw new Error("未找到 plan 数组；请检查 GPT 输出格式");
    }

    /* ---------- 轻量容错：仅改常见字段名 ---------- */
    const fixed = planArr.map(step => {
        const name = step.name;
        const args = { ...(step.args || step.arguments || {}) };
        if (name === "redeem" && args.amount && !args.percent)           {
            args.percent = args.amount; delete args.amount;
        }
        // getReserves / countSwaps 暂无需特殊修正

        return { name, args };
    });

    console.log("📋 Fixed plan:", fixed);
    return fixed;
}
