import React, { useEffect, useState, useRef } from "react";
import { askForPlan } from "../llmService.jsx";
import { runPlan } from "../planRunner.jsx";

export default function TestSuite() {
    const [cases, setCases] = useState([]);
    const [newCase, setNewCase] = useState("");
    const [logMap, setLogMap] = useState({});
    const dragItem = useRef();
    const dragOverItem = useRef();

    useEffect(() => {
        const stored = JSON.parse(localStorage.getItem("testCases") || "[]");
        setCases(stored);
    }, []);

    const saveCases = updated => {
        setCases(updated);
        localStorage.setItem("testCases", JSON.stringify(updated));
    };

    const handleRun = async (testCase, index) => {
        const setLog = log => {
            setLogMap(prev => ({ ...prev, [index]: log }));
        };
        setLog(["💬 " + testCase]);
        try {
            const plan = await askForPlan(testCase, localStorage.getItem("oaKey") || "");
            const result = await runPlan(plan, l => setLog(prev => [...prev, l]), testCase);
            setLog(prev => [...prev, `✅ Complete：${JSON.stringify(result)}`]);
        } catch (err) {
            setLog(prev => [...prev, `❌ ${err.message}`]);
        }
    };

    const handleDrop = () => {
        const copy = [...cases];
        const dragItemContent = copy[dragItem.current];
        copy.splice(dragItem.current, 1);
        copy.splice(dragOverItem.current, 0, dragItemContent);
        dragItem.current = null;
        dragOverItem.current = null;
        saveCases(copy);
    };

    return (
        <div style={{ flex: 1, paddingLeft: "1rem", borderLeft: "1px solid #ccc" }}>
            <h3>🧪 TestCase</h3>
            <textarea
                rows={2}
                value={newCase}
                onChange={e => setNewCase(e.target.value)}
                style={{ width: "100%" }}
                placeholder="input new nl command"
            />
            <button onClick={() => {
                const updated = [...cases, newCase.trim()];
                saveCases(updated);
                setNewCase("");
            }}>➕ Add New Testcase</button>

            <hr />
            {cases.map((c, i) => (
                <div
                    key={i}
                    draggable
                    onDragStart={() => (dragItem.current = i)}
                    onDragEnter={() => (dragOverItem.current = i)}
                    onDragEnd={handleDrop}
                    onDragOver={e => e.preventDefault()}
                    style={{
                        marginBottom: "1rem",
                        cursor: "grab",
                        padding: "0.5rem",
                        border: "1px dashed #aaa",
                        borderRadius: "5px",
                        background: "#fff"
                    }}
                    onContextMenu={e => {
                        e.preventDefault();
                        if (confirm(`Delete test case ${i + 1}?\n"${c}"`)) {
                            const updated = [...cases.slice(0, i), ...cases.slice(i + 1)];
                            saveCases(updated);
                        }
                    }}
                    onDoubleClick={() => {
                        if (typeof window.setNLPrompt === "function") {
                            window.setNLPrompt(c);
                        } else {
                            alert("NLBox not ready.");
                        }
                    }}
                >
                    <div style={{ fontWeight: "bold" }}>{i + 1}. {c}</div>
                    <pre style={{
                        background: "#f7f7f7", padding: "0.5rem",
                        whiteSpace: "pre-wrap", border: "1px solid #ddd"
                    }}>
                        {Array.isArray(logMap[i]) ? logMap[i].join("\n") : String(logMap[i] || "")}
                    </pre>
                </div>
            ))}
        </div>
    );
}
