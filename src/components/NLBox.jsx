// src/components/NLBox.jsx
import { useState,useEffect } from "react";
import { askForPlan } from "../llmService";
import { runPlan }    from "../planRunner";        // ← 注意不带 .jsx

/**
 * @param {Object}   props
 * @param {Object}   props.tokenRegistry   // 目前没用，留做扩展
 * @param {Function} props.setSelectedPool // App.jsx 传进来，选中池子
 * @param {Function} props.refreshPools    // App.jsx 传进来，刷新池子列表
 */
export default function NLBox({ tokenRegistry, setSelectedPool, refreshPools }) {
    useEffect(() => {
        window.setNLPrompt = setPrompt;  // 让外部可访问 NL 输入框
        return () => { delete window.setNLPrompt; };  // 卸载时清理
    }, []);
    /* ----------- 本地状态 ----------- */
    const [prompt, setPrompt] = useState("");
    const [oaKey,  setKey]    = useState(localStorage.getItem("oaKey") || "");
    const [log,    setLog]    = useState([]);

    /* ----------- 处理 NL 指令 ----------- */
    async function handleRun() {
        setLog([]);                      // 清空旧日志
        try {
            /* 1️⃣ 让 LLM 生成 plan */
            const plan = await askForPlan(prompt, oaKey.trim());
            /* 2️⃣ 执行 plan */
            const last = await runPlan(plan, setLog,prompt);

            /* 3️⃣ 如果返回 poolAddress → 选中 + 刷新 */
            if (last?.poolAddress) {
                setSelectedPool?.(last.poolAddress);
                refreshPools?.();
            }
        } catch (e) {
            setLog(l => [...l, `❌ ${e.message}`]);
        }
    }

    /* ----------- UI ----------- */
    return (
        <div style={{ border: "1px solid #888", padding: "1rem", marginTop: "1rem" }}>
            <h3>NL Interaction</h3>

            {/* 指令输入框 */}
            <textarea
                rows={3}
                style={{ width: "100%" }}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder='e.g. "create pool with token 0xAAA and 0xBBB"'
            />

            {/* OpenAI Key 输入 */}
            <div style={{ margin: "0.5rem 0" }}>
                OpenAI Key:
                <input
                    style={{ width: "60%" }}
                    value={oaKey}
                    onChange={e => {
                        setKey(e.target.value);
                        localStorage.setItem("oaKey", e.target.value);
                    }}
                />
            </div>

            <button onClick={handleRun}>Run</button>

            {/* 执行日志 */}
            {/* 执行结果区域 */}
            <div style={{ marginTop: "1rem", borderTop: "1px solid #ccc", paddingTop: "1rem" }}>
                <h4>🧾 Results</h4>
                <pre style={{
                    whiteSpace: "pre-wrap",
                    background: "#f9f9f9",
                    padding: "0.5rem",
                    borderRadius: "4px",
                    border: "1px solid #ddd"
                }}>
                {log.join("\n")}
                </pre>
            </div>
        </div>
    );
}
