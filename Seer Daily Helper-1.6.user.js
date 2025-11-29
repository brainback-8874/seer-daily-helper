// ==UserScript==
// @name         Seer Daily Helper
// @namespace    https://github.com/brainback-8874/seer-daily-helper
// @version      1.7
// @description  赛尔号启航日常任务自动化：自动刷资源、轮盘抽奖、Boss挑战，提升游戏效率。
// @author       brainback-8874
// @match        https://s.61.com/*
// @match        http://s.61.com/*
// @icon         https://s.61.com/favicon.ico
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // ======================
    // 抓包分析面板创建
    // ======================
    const createAnalysisPanel = () => {
        const panel = document.createElement('div');
        panel.id = 'packet-analysis-panel';
        panel.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            width: 420px;
            height: 450px;
            background: rgba(0, 0, 0, 0.88);
            color: #00ff00;
            border: 2px solid #00ff00;
            border-radius: 8px;
            padding: 15px;
            z-index: 999999;
            font-family: monospace;
            overflow-y: auto;
            box-shadow: 0 0 20px rgba(0, 255, 0, 0.5);
        `;
        panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h3 style="color: #00ffaa; margin: 0; font-size: 18px;">seer-daily-helper</h3>
                <button id="toggle-panel" style="background: #005500; color: white; border: 1px solid #00ffaa; padding: 5px 10px; cursor: pointer; border-radius: 4px;">收起</button>
            </div>
            <div id="analysis-content">
                <div style="margin-bottom: 12px;">
                    <button id="start-capture" style="background: #006600; color: white; border: 1px solid #00ff00; padding: 6px 10px; margin-right: 6px; cursor: pointer; border-radius: 4px;">开始捕获</button>
                    <button id="stop-capture" style="background: #660000; color: white; border: 1px solid #ff0000; padding: 6px 10px; cursor: pointer; border-radius: 4px;">停止捕获</button>
                </div>
                <div id="packet-log" style="height: 450px; overflow-y: auto; border: 1px solid #00ff00; padding: 10px; background: rgba(0, 20, 0, 0.5); border-radius: 6px;">
                    <div style="color: #00ffcc;">等待捕获数据...</div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        return panel;
    };

    // 创建悬浮唤醒球（解决收起后无法找回的问题）
    const createToggleBall = () => {
        if (document.getElementById('helper-toggle-ball')) return; // 防重复
        const ball = document.createElement('div');
        ball.id = 'helper-toggle-ball';
        ball.textContent = '⚙️';
        ball.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 40px;
            height: 40px;
            background: rgba(0, 30, 0, 0.7);
            color: #00ffaa;
            border: 1px solid #00ff55;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            cursor: pointer;
            z-index: 999998;
            user-select: none;
            box-shadow: 0 0 8px rgba(0, 255, 100, 0.5);
    `    ;
        ball.title = 'seer-daily-helper';
        ball.addEventListener('click', () => {
            const panel = document.getElementById('packet-analysis-panel');
            if (!panel) return;
            const isHidden = panel.style.display === 'none';
            panel.style.display = isHidden ? 'block' : 'none';
            const toggleBtn = document.getElementById('toggle-panel');
            if (toggleBtn) {
                toggleBtn.textContent = isHidden ? '收起' : '展开';
            }
        });
        document.body.appendChild(ball);
    };

    const panel = createAnalysisPanel();
    let isCapturing = false;
    let capturedPackets = [];

    const packetLog = document.getElementById('packet-log');
    const startCaptureBtn = document.getElementById('start-capture');
    const stopCaptureBtn = document.getElementById('stop-capture');
    const togglePanelBtn = document.getElementById('toggle-panel');

    // 日志函数
    const logMessage = (message, type = 'info') => {
        if (!packetLog) return;
        const colors = {
            error: '#ff6666',
            warn: '#ffff66',
            success: '#66ff66',
            info: '#00ffcc'
        };
        const borders = {
            error: '#ff0000',
            warn: '#ffff00',
            success: '#00ff00',
            info: '#00ffaa'
        };
        const logEntry = document.createElement('div');
        logEntry.style.cssText = `
            margin: 4px 0;
            padding: 5px;
            border-left: 3px solid ${borders[type] || borders.info};
            background: rgba(0, 30, 30, 0.3);
            font-size: 13px;
        `;
        logEntry.innerHTML = `<span style="color: ${colors[type] || colors.info};">${new Date().toLocaleTimeString()} - ${message}</span>`;
        packetLog.appendChild(logEntry);
        packetLog.scrollTop = packetLog.scrollHeight;
    };

    // 捕获网络请求
    const captureNetworkRequest = (cmd, data) => {
        if (!isCapturing) return;
        const packet = {
            timestamp: Date.now(),
            cmd: cmd,
            data: data,
            time: new Date().toLocaleTimeString()
        };
        capturedPackets.push(packet);
        //logMessage(`捕获到请求: CMD=${cmd}`, 'info');
        // 不再打印完整 data，避免日志爆炸
    };

    // 原始发包函数（确保走钩子）
    const originalSendMsg = (cmd, body) => {
        captureNetworkRequest(cmd, body);
        if (window.GlobalSocket?.PROTOCOL_SOCKET) {
            window.GlobalSocket.PROTOCOL_SOCKET.send(cmd, body);
        } else if (document.querySelector('iframe')?.contentWindow?.GlobalSocket?.PROTOCOL_SOCKET) {
            document.querySelector('iframe').contentWindow.GlobalSocket.PROTOCOL_SOCKET.send(cmd, body);
        } else {
            logMessage('未找到GlobalSocket实例', 'error');
        }
    };

    // 钩子函数
    const hookNetworkRequests = () => {
        if (window.SocketSeqMsgs) {
            const originalCreateMsg = window.SocketSeqMsgs.prototype.createMsg;
            window.SocketSeqMsgs.prototype.createMsg = function (t, e) {
                originalCreateMsg.call(this, t, e);
                if (this._tmpBytesArray?.length > 0) {
                    const s = this._tmpBytesArray[this._tmpBytesArray.length - 1];
                    if (s?.header?.cmd && s.raw) {
                        const cmd = parseInt((s.header.cmd + "").trim());
                        captureNetworkRequest(cmd, s.raw);
                    }
                }
            };
        }

        const hookIframe = () => {
            const iframe = document.querySelector('iframe');
            if (iframe?.contentWindow?.SocketSeqMsgs) {
                const originalCreateMsg = iframe.contentWindow.SocketSeqMsgs.prototype.createMsg;
                iframe.contentWindow.SocketSeqMsgs.prototype.createMsg = function (t, e) {
                    originalCreateMsg.call(this, t, e);
                    if (this._tmpBytesArray?.length > 0) {
                        const s = this._tmpBytesArray[this._tmpBytesArray.length - 1];
                        if (s?.header?.cmd && s.raw) {
                            const cmd = parseInt((s.header.cmd + "").trim());
                            captureNetworkRequest(cmd, s.raw);
                        }
                    }
                };
            }
        };

        const iframe = document.querySelector('iframe');
        if (iframe) {
            iframe.addEventListener('load', hookIframe);
            if (iframe.contentWindow && iframe.contentWindow.SocketSeqMsgs) {
                hookIframe();
            }
        }
    };

    // 按钮事件
    startCaptureBtn.addEventListener('click', () => {
        isCapturing = true;
        logMessage('🟢 开始捕获网络请求...', 'info');
        hookNetworkRequests();
    });

    stopCaptureBtn.addEventListener('click', () => {
        isCapturing = false;
        logMessage('🔴 停止捕获网络请求', 'warn');
    });

    togglePanelBtn.addEventListener('click', () => {
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
            togglePanelBtn.textContent = '收起';
        } else {
            panel.style.display = 'none';
            togglePanelBtn.textContent = '展开';
        }
    });

    // ======================
    // 日常任务模块（核心）
    // ======================

    let isAutoFighting = false;
    let isAutoSpinning = false;
    let isAutoFightingBoss = false;
    let currentSkillID = null;

    // ===== 任务配置区 =====
    const RESOURCE_TASKS = {
    "克洛斯星": {
        planetId: 1,
        stages: [
            { mapId: 20001, viewId: 109, levelId: 1, maxCount: 10, name: "①" },
            { mapId: 20002, viewId: 87,  levelId: 2, maxCount: 10, name: "②" },
            { mapId: 20003, viewId: 29,  levelId: 3, maxCount: 5,  name: "③-A" },
            { mapId: 20003, viewId: 29,  levelId: 4, maxCount: 5,  name: "③-B" }
        ]
    },
    "海洋星": {
        planetId: 2,
        stages: [
            { mapId: 20004, viewId: 31, levelId: 9,  maxCount: 20, name: "①" },
            { mapId: 20005, viewId: 31, levelId: 10, maxCount: 10, name: "②" },
            { mapId: 20006, viewId: 31, levelId: 11, maxCount: 3,  name: "③" }
        ]
    },
    "火山星": {
        planetId: 3,
        stages: [
            { mapId: 20007, viewId: 9, levelId: 12, maxCount: 10, name: "①" },
            { mapId: 20008, viewId: 9, levelId: 13, maxCount: 20, name: "②" },
            { mapId: 20009, viewId: 9, levelId: 14, maxCount: 3,  name: "③" }
        ]
    },
    "云霄星": {
        planetId: 5,
        stages: [
            { mapId: 20015, viewId: 33, levelId: 33, maxCount: 20, name: "①" },
            { mapId: 20016, viewId: 34, levelId: 34, maxCount: 10, name: "②" },
            { mapId: 20017, viewId: 35, levelId: 35, maxCount: 5,  name: "③" }
        ]
    },
    "双子星": {
        planetId: 6,
        stages: [
            { mapId: 20018, viewId: 179, levelId: 179, maxCount: 10, name: "①" },
            { mapId: 20020, viewId: 60,  levelId: 60,  maxCount: 10, name: "②" }
        ]
    },
    "拜伦号": {
        planetId: 8,
        stages: [
            { mapId: 20026, viewId: 66, levelId: 66, maxCount: 20, name: "①" }
            // 后续可追加②③...
        ]
    }
};
    // 定义日常任务执行顺序（后续可在此追加星球）
    const DAILY_PLANET_ORDER = ["克洛斯星", "海洋星", "火山星", "云霄星", "双子星", "拜伦号"];
    const BOSS_LIST = [
        {
            name: "双子阿尔法星②",
            planetId: 6,
            levelId: 178,
            materialId: 100194,
            maxTimes: 3
        },
        {
            name: "拜伦号②",
            planetId: 8,
            levelId: 233,
            materialId: 100314,
            maxTimes: 3
        }
    ];
    // 查询背包中某物品的数量
    const getInventoryItemCount = (itemId) => {
        let count = 0;

        try {
            // 【1】尝试主窗口
            if (window.ItemManager) {
                count = window.ItemManager.getInstance().getItemNumById(itemId);
                return count;
            }
        } catch (e) {
            // 忽略错误，继续尝试 iframe
        }

        try {
            // 【2】尝试 iframe
            const iframe = document.querySelector("iframe");
            if (iframe && iframe.contentWindow.ItemManager) {
                count = iframe.contentWindow.ItemManager.getInstance().getItemNumById(itemId);
                return count;
            }
        } catch (e) {
            // 忽略错误
        }

        // 【3】都失败了
        logMessage(`⚠️ 无法获取物品 ${itemId} 数量，返回 0`, 'warn');
        return 0;
    };
    // 查询某星球下某个关卡的已领取奖励次数
    const queryBossRewardCount = async (planetId, levelId) => {
        await originalSendMsg(1176, { planetId }); // 请求星球信息
        await delay(300); // 等待响应

        // 从 capturedPackets 中查找 cmd:1176 的最新响应
        for (let i = capturedPackets.length - 1; i >= 0; i--) {
            if (capturedPackets[i].cmd === 1176) {
                try {
                    const data = JSON.parse(capturedPackets[i].data);
                    const reward = data.reward || {};
                    return reward[levelId] || 0;
                } catch (e) {
                    logMessage(`❌ 解析 cmd:1176 响应失败`, 'error');
                    return 0;
                }
            }
        }
        logMessage(`⚠️ 未收到 cmd:1176 响应（planetId: ${planetId}）`, 'warn');
        return 0;
    };
    const WHEEL_CONFIGS = [
        // 皮皮星
        { name: "皮皮星", levelId: 1, prizePool: 1, cost: [{ id: 100014, count: 5 }], desc: "光合能量 x5" },

        // 海洋星
        { name: "海洋星1级", levelId: 2, prizePool: 1, cost: [{ id: 100015, count: 2 }, { id: 100016, count: 1 }], desc: "甲烷x2 + 青晶石x1" },
        { name: "海洋星2级", levelId: 2, prizePool: 2, cost: [{ id: 100015, count: 2 }, { id: 100016, count: 1 }, { id: 100017, count: 1 }], desc: "甲烷x2 + 青晶石x1 + 黑曜石x1" },

        // 火山星
        { name: "火山星1级", levelId: 3, prizePool: 1, cost: [{ id: 100029, count: 1 }, { id: 100030, count: 2 }], desc: "甲烷x1 + 青晶石x2" },
        { name: "火山星2级", levelId: 3, prizePool: 2, cost: [{ id: 100031, count: 1 }], desc: "火核x1" },

        // 云霄星
        { name: "云霄星1级", levelId: 5, prizePool: 1, cost: [{ id: 100076, count: 2 }], desc: "空气结晶x2" },
        { name: "云霄星2级", levelId: 5, prizePool: 2, cost: [{ id: 100077, count: 2 }, { id: 100078, count: 1 }], desc: "不息云壤x2 + 幻影之羽x1" },

        // 双子星（阿尔法）
        { name: "双子星1级", levelId: 6, prizePool: 1, cost: [{ id: 100191, count: 1 }, { id: 100193, count: 1 }], desc: "材料A+B" },
        { name: "双子星2级", levelId: 6, prizePool: 2, cost: [{ id: 100195, count: 1 }], desc: "高级材料x1" },

        // 暗影星（拜伦号）
        { name: "暗影星1级", levelId: 8, prizePool: 1, cost: [{ id: 100313, count: 2 }], desc: "暗影碎片x2" },
        { name: "暗影星2级", levelId: 8, prizePool: 2, cost: [{ id: 100315, count: 1 }], desc: "稀有核心x1" }
    ];
    // ===========================
    const delay = ms => new Promise(r => setTimeout(r, ms));

    // 获取技能ID
    const getMainSkillID = () => {
    let skillID = 10001; // 默认保底

    try {
        // 【1】优先尝试 iframe（原脚本逻辑）
        const iframeWin = document.querySelector("iframe")?.contentWindow;
        if (iframeWin && iframeWin.UserManager) {
            const firTime = iframeWin.UserManager.getInstance().userInfo.defaultTeam[0];
            const pet = iframeWin.PetManager.getInstance().getPetInfoByGetTime(firTime);
            skillID = pet.skills[0];
            logMessage(`✅ 从 iframe 获取技能ID: ${skillID}`, 'info');
            return skillID;
        }
    } catch (e) {
        logMessage('⚠️ iframe 获取技能失败，尝试主窗口...', 'warn');
    }

    try {
        // 【2】回退到主窗口
        if (window.UserManager) {
            const firTime = window.UserManager.getInstance().userInfo.defaultTeam[0];
            const pet = window.PetManager.getInstance().getPetInfoByGetTime(firTime);
            skillID = pet.skills[0];
            logMessage(`✅ 从主窗口获取技能ID: ${skillID}`, 'info');
            return skillID;
        }
    } catch (e) {
        logMessage('⚠️ 主窗口获取技能失败', 'error');
    }

    logMessage('❌ 无法获取技能ID，使用默认值 10001', 'error');
    return 10001;
};

    // 执行单个关卡
    const autoFightStage = async (stageConfig, planetId) => {
        const { mapId, viewId, levelId, maxCount, name } = stageConfig;

        while (isAutoFighting) {
            // 查询当前进度（使用正确的 planetId）
            await originalSendMsg(1176, { planetId });
            await delay(200);

            let reward = {};
            capturedPackets.forEach(pkt => {
                if (pkt.cmd === 1176) {
                    try {
                        const data = JSON.parse(pkt.data);
                        reward = data.reward || {};
                    } catch (e) {}
                }
            });

            const current = reward[levelId] || 0;
            if (current >= maxCount) {
                logMessage(`✅ ${name} 已完成（${maxCount}/${maxCount}）`, 'success');
                return true;
            }

            logMessage(`🔄 ${name} 第${current + 1}/${maxCount}次...`, 'info');

            // === 战斗流程 ===
            await originalSendMsg(279, {});
            await delay(200);

            await originalSendMsg(4354, { mapId, viewId });
            await delay(200);

            await originalSendMsg(1172, {
            levelId,
            battleType: 3,
            mapId,
            viewId
        });
            await delay(200);

            await originalSendMsg(1045, { data: "", groupId: "", battleType: 5 });
            await delay(200);

            // 获取 groupId
            await originalSendMsg(1057, { groupId: "" });
            await delay(200);

            // 提取 groupId（关键！避免协议错误）
            let currentGroupId = "";
            for (let i = capturedPackets.length - 1; i >= 0; i--) {
                if (capturedPackets[i].cmd === 1057) {
                    try {
                        const data = JSON.parse(capturedPackets[i].data);
                        currentGroupId = capturedPackets[i].data.groupId || "";
                        break;
                    } catch (e) {}
                }
            }

            await originalSendMsg(1045, {
                opType: 1,
                data: { skillID: currentSkillID },
                groupId: currentGroupId
            });
            await delay(1000);
        }
        return false;
    };
    // 执行boss关卡
    const fightBossInstance = async (config) => {
        const { name, planetId, levelId, materialId, maxTimes = 3 } = config;

        // 1. 检查材料
        const materialCount = getInventoryItemCount(materialId);
        if (materialCount <=0) {
            logMessage(`🛑 ${name} 材料不足（需 3 个，当前 ${materialCount}）`, 'warn');
            return;
        }
        // 友好提示：材料不足以打满 3 次
        if (materialCount < maxTimes) {
            logMessage(`ℹ️ ${name}：材料仅 ${materialCount} 个，最多可挑战 ${materialCount} 次`, 'info');
        }
        // 2. 获取技能
        const skillId = getMainSkillID();
        if (!skillId || skillId === 10001) {
            logMessage(`⚠️ ${name}：技能ID异常，可能无法完成战斗`, 'warn');
        }

        logMessage(`⚔️ 开始处理 ${name}...`, 'info');

        while (isAutoFightingBoss) {
            // === 步骤1：查询当前已打次数 ===
            const queryStart = capturedPackets.length;
            await originalSendMsg(1176, { planetId });
            await delay(200);

            let reward = {};
            for (let i = capturedPackets.length - 1; i >= queryStart; i--) {
                if (capturedPackets[i].cmd === 1176) {
                    try {
                        const data = JSON.parse(capturedPackets[i].data);
                        reward = data.reward || {};
                        break; // 取最新响应
                    } catch (e) {}
                }
            }

            const currentCount = reward[levelId] || 0;
            if (currentCount >= maxTimes) {
                logMessage(`✅ ${name} 已完成（${maxTimes}/${maxTimes}次）`, 'success');
                return;
            }
            // ⚠️ 新增：检查剩余材料是否够本次挑战
            const currentMaterial = getInventoryItemCount(materialId);
            if (currentMaterial <= 0) {
                logMessage(`🛑 ${name}：材料耗尽，停止挑战`, 'warn');
                return;
            }
            logMessage(`🔄 ${name} 第 ${currentCount + 1} 次挑战...`, 'info');

            // === 步骤2：进入战斗 ===
            const enterStart = capturedPackets.length;
            await originalSendMsg(1172, {
                levelId: levelId,
                battleType: 3
            });
            await delay(500);
            // 从本次响应中提取 onlyId（来自 1049 / 1044 / 1056）
            let onlyId = "";
            for (let i = capturedPackets.length - 1; i >= enterStart; i--) {
                const pkt = capturedPackets[i];
                if ([1049, 1044, 1056].includes(pkt.cmd)) {
                    try {
                        const data = JSON.parse(pkt.data);
                        if (data.onlyId) {
                            onlyId = data.onlyId;
                            break;
                        }
                    } catch (e) {}
                }
            }

            if (!onlyId) {
                logMessage(`⚠️ ${name}：未获取到 onlyId，跳过本次`, 'warn');
                await delay(1000);
                continue;
            }
            // === 步骤3：循环释放技能直到胜利 ===
            let round = 0;
            let battleEnded = false;
            const maxRounds = 5; // 防死循环
            while (round < maxRounds && !battleEnded && isAutoFightingBoss) {
                round++;
                logMessage(`🎯 ${name} 第 ${round} 次释放技能...`, 'info');
                // === 释放技能 ===
                await originalSendMsg(1045, {
                    opType: 1,
                    data: { skillID: skillId },
                    groupId: onlyId // 实际上传的是 onlyId（协议字段名是 groupId，但值是 onlyId）
                });

                // 【关键】等待战斗结果或下一轮信号
                await delay(300);
                // 检查本轮是否收到战斗结束信号
                for (let i = capturedPackets.length - 1; i >= enterStart; i--) {
                    const pkt = capturedPackets[i];
                    if (pkt.cmd === 1056) {
                        try {
                            const data = JSON.parse(pkt.data);
                            const result = data.result?.result;
                            if (result === 1) {
                                logMessage(`✅ ${name} 击杀成功（${round} 轮）`, 'success');
                                battleEnded = true;
                                break;
                            } else if (result === 2) {
                                logMessage(`❌ ${name} 战斗失败`, 'error');
                                battleEnded = true;
                                break;
                            }
                            // result === 0 表示战斗进行中，继续
                        } catch (e) {}
                    }
                }

                if (!battleEnded) {
                    await delay(300);
                }
            }
            // 战斗后冷却
            await delay(1000);
        }
    };
    // 主任务流程
    const startAutoResourceTask = async () => {
        if (isAutoFighting) {
            logMessage('⚠️ 日常任务已在运行中...', 'warn');
            return;
        }

        // 获取技能ID（只执行一次）
        currentSkillID = getMainSkillID();
        // 【新增】在这里用 logMessage 输出技能ID
        if (currentSkillID === 10001) {
            logMessage('🔧 使用默认技能ID：10001（未成功读取主战精灵技能）', 'warn');
        } else {
            logMessage(`🔧 当前战斗技能ID：${currentSkillID}`, 'info');
        }
        isAutoFighting = true;
        logMessage('🚀 开始执行日常任务（按顺序）...', 'info');

        try {
            // 按顺序遍历所有星球
            for (const planetName of DAILY_PLANET_ORDER) {
                if (!isAutoFighting) break;

                const planetConfig = RESOURCE_TASKS[planetName];
                if (!planetConfig) {
                    logMessage(`❌ 跳过未配置的星球: ${planetName}`, 'error');
                    continue;
                }

                const { planetId, stages } = planetConfig;
                logMessage(`🌌 开始处理【${planetName}】...`, 'info');

                // 遍历该星球的所有关卡
                for (let i = 0; i < stages.length && isAutoFighting; i++) {
                    const stage = stages[i];

                    // === 特殊处理：克洛斯星③ 的双子关逻辑 ===
                    if (planetName === "克洛斯星" && (stage.levelId === 3 || stage.levelId === 4)) {
                        await originalSendMsg(1176, { planetId });
                        await delay(200);

                        let reward = {};
                        capturedPackets.forEach(pkt => {
                            if (pkt.cmd === 1176) {
                                try {
                                    const data = JSON.parse(pkt.data);
                                    reward = data.reward || {};
                                } catch (e) {}
                            }
                        });

                        const c3 = reward[3] || 0;
                        const c4 = reward[4] || 0;

                        if (c3 >= 5 && c4 >= 5) {
                            logMessage('✅ 克洛斯星③ 已全部完成', 'success');
                            break; // 跳出当前星球的关卡循环
                        }

                        // 如果当前子关已完成，跳过本次战斗
                        if ((stage.levelId === 3 && c3 >= 5) || (stage.levelId === 4 && c4 >= 5)) {
                            continue;
                        }
                    }

                    // 执行当前关卡
                    await autoFightStage(stage, planetId);
                }

                logMessage(`🎉 【${planetName}】日常任务完成！`, 'success');
                await delay(1000); // 星球间缓冲
            }

            logMessage('🎊 所有日常任务已完成！', 'success');
        } catch (error) {
            logMessage(`💥 日常任务异常: ${error.message}`, 'error');
            console.error(error);
        } finally {
            isAutoFighting = false;
        }
    };
    // ===============================================
    const stopAutoResourceTask = () => {
        isAutoFighting = false;
        logMessage('🛑 用户手动停止任务', 'warn');
    };
    // ===============================================
    const spinWheel = async (config) => {
        let spinCount = 0;

        while (isAutoSpinning) {
            // 检查是否满足消耗
            let canSpin = true;
            for (const { id, count: needCount } of config.cost) {
                const haveCount = getInventoryItemCount(id); // ✅ 同步调用
                if (haveCount < needCount) {
                    canSpin = false;
                    break;
                }
            }

            if (!canSpin) {
                logMessage(`✅ ${config.name} 轮盘材料不足，跳过`, 'info');
                break;
            }

            spinCount++;
            logMessage(`🔄 ${config.name} 第${spinCount}次抽取...`, 'info');

            // 发送轮盘请求
            await originalSendMsg(8997, {
                levelId: config.levelId,
                prizePool: config.prizePool
            });
            await delay(500); // 防止过快
        }

        if (spinCount > 0) {
            logMessage(`🎉 ${config.name} 共抽取 ${spinCount} 次`, 'success');
        }
    };
    // ===============================================
    const startAutoSpinWheel = async () => {
        if (isAutoSpinning) {
            logMessage('⚠️ 轮盘任务已在运行中...', 'warn');
            return;
        }

        // 【检查是否开启监听】
        if (typeof originalSendMsg !== 'function') {
            logMessage('❌ 请先点击“开始捕获”以启用协议拦截！', 'error');
            return;
        }

        isAutoSpinning = true;
        logMessage('🎡 开始自动轮盘抽取...', 'info');

        try {
            for (const config of WHEEL_CONFIGS) {
                if (!isAutoSpinning) break;
                await spinWheel(config);
                await delay(200);
            }
            logMessage('🎊 所有轮盘抽取完成！', 'success');
        } catch (error) {
            logMessage(`💥 轮盘任务异常: ${error.message}`, 'error');
            console.error(error);
        } finally {
            isAutoSpinning = false;
        }
    };
    // ===============================================
    const stopAutoSpinWheel = () => {
        isAutoSpinning = false;
        logMessage('🛑 用户手动停止轮盘任务', 'warn');
    };
    // ===============================================
    const startAutoFightBoss = async () => {
        if (isAutoFightingBoss) {
            logMessage('⚠️ Boss 刷取任务已在运行中', 'warn');
            return;
        }

        // 检查游戏环境是否就绪
        if (!window.ItemManager && !document.querySelector("iframe")?.contentWindow?.ItemManager) {
            logMessage('❌ 请先点击“开始捕获”以加载游戏数据！', 'error');
            return;
        }

        isAutoFightingBoss = true;
        logMessage('🚀 开始自动刷 Boss（双子星 → 拜伦号）...', 'info');

        try {
            for (const boss of BOSS_LIST) {
                if (!isAutoFightingBoss) break;
                await fightBossInstance(boss);
                await delay(200);
            }
            logMessage('🎉 所有 Boss 刷取任务已完成！', 'success');
        } catch (error) {
            logMessage(`💥 刷 Boss 异常: ${error.message}`, 'error');
            console.error(error);
        } finally {
            isAutoFightingBoss = false;
        }
    };
    // ===============================================
    const stopAutoFightBoss = () => {
        isAutoFightingBoss = false;
        logMessage('🛑 用户手动停止刷 Boss 任务', 'warn');
    };
    // 添加自动任务按钮
    const addAutoResourceButton = () => {
        const btnDiv = document.createElement('div');
        btnDiv.innerHTML = `
            <div style="margin-top: 15px; padding: 12px; border: 1px solid #ff5500; background: rgba(30, 10, 0, 0.4); border-radius: 6px;">
                <h4 style="color: #ffaa00; margin-top: 0; font-size: 16px;">日常任务</h4>
                <button id="start-auto-resource" style="background: #442200; color: white; border: 1px solid #ffaa00; padding: 6px 12px; margin: 3px; cursor: pointer; border-radius: 4px;">
                    开始刷日常
                </button>
                <button id="stop-auto-resource" style="background: #662200; color: white; border: 1px solid #ff5500; padding: 6px 12px; margin: 3px; cursor: pointer; border-radius: 4px;">
                    停止
                </button>
                <div style="font-size: 12px; color: #aaa; margin-top: 6px;">
                    自动完成资源收集
                </div>
            </div>
        `;
        document.getElementById('analysis-content').appendChild(btnDiv);

        document.getElementById('start-auto-resource').addEventListener('click', startAutoResourceTask);
        document.getElementById('stop-auto-resource').addEventListener('click', stopAutoResourceTask);
    };
    const addSpinWheelButton = () => {
        const btnDiv = document.createElement('div');
        btnDiv.innerHTML = `
        <div style="margin-top: 15px; padding: 12px; border: 1px solid #ff55ff; background: rgba(30, 10, 30, 0.4); border-radius: 6px;">
            <h4 style="color: #ff99ff; margin-top: 0; font-size: 16px;">轮盘抽取</h4>
            <button id="start-spin-wheel" style="background: #441144; color: white; border: 1px solid #ff99ff; padding: 6px 12px; margin: 3px; cursor: pointer; border-radius: 4px;">
                开始轮盘
            </button>
            <button id="stop-spin-wheel" style="background: #662266; color: white; border: 1px solid #ff55ff; padding: 6px 12px; margin: 3px; cursor: pointer; border-radius: 4px;">
                停止
            </button>
            <div style="font-size: 12px; color: #aaa; margin-top: 6px;">
                自动使用材料抽取所有星球轮盘
            </div>
        </div>
    `;
        document.getElementById('analysis-content').appendChild(btnDiv);

        document.getElementById('start-spin-wheel').addEventListener('click', startAutoSpinWheel);
        document.getElementById('stop-spin-wheel').addEventListener('click', stopAutoSpinWheel);
    };
    const addFightBossButton = () => {
        const container = document.createElement('div');
        container.innerHTML = `
        <div style="margin-top: 15px; padding: 12px; border: 1px solid #ff5555; background: rgba(30, 10, 10, 0.4); border-radius: 6px;">
            <h4 style="color: #ff9999; margin: 0 0 10px; font-size: 16px;">刷 Boss</h4>
            <button id="btn-start-boss" style="background: #441111; color: white; border: 1px solid #ff9999; padding: 6px 12px; margin: 3px; cursor: pointer; border-radius: 4px;">
                开始刷 Boss
            </button>
            <button id="btn-stop-boss" style="background: #662222; color: white; border: 1px solid #ff5555; padding: 6px 12px; margin: 3px; cursor: pointer; border-radius: 4px;">
                停止
            </button>
            <div style="font-size: 12px; color: #ccc; margin-top: 8px;">
                自动打「双子阿尔法星-纳多雷」和「拜伦号-尤纳斯」（各最多3次，需材料≥3）
            </div>
        </div>
    `;
        document.getElementById('analysis-content').appendChild(container);

        document.getElementById('btn-start-boss').addEventListener('click', startAutoFightBoss);
        document.getElementById('btn-stop-boss').addEventListener('click', stopAutoFightBoss);
    };
    // 初始化其他功能（命令分析、导出等）
    const addCommandAnalysis = () => {
        const analysisDiv = document.createElement('div');
        analysisDiv.innerHTML = `
            <div style="margin-top: 10px; padding: 10px; border: 1px solid #00ff00; background: rgba(0, 20, 0, 0.3); border-radius: 6px;">
                <h4 style="color: #00ff00; margin-top: 0;">常用命令分析</h4>
                <button id="analyze-battle" style="background: #004400; color: white; border: 1px solid #00ff00; padding: 5px 10px; margin: 2px; cursor: pointer; border-radius: 4px;">战斗相关(1042,1045,1057)</button>
                <button id="analyze-resources" style="background: #004400; color: white; border: 1px solid #00ff00; padding: 5px 10px; margin: 2px; cursor: pointer; border-radius: 4px;">资源获取(1172,279,4354)</button>
                <button id="analyze-pvp" style="background: #004400; color: white; border: 1px solid #00ff00; padding: 5px 10px; margin: 2px; cursor: pointer; border-radius: 4px;">PVP相关(10042,10043)</button>
                <button id="analyze-mihang" style="background: #004400; color: white; border: 1px solid #00ff00; padding: 5px 10px; margin: 2px; cursor: pointer; border-radius: 4px;">迷航相关(1120,1121,1122)</button>
            </div>
        `;
        document.getElementById('analysis-content').appendChild(analysisDiv);

        document.getElementById('analyze-battle').addEventListener('click', () => {
            logMessage('战斗相关命令分析:', 'info');
            logMessage('1042: 开始战斗', 'info');
            logMessage('1045: 战斗操作(opType: 1=技能, 3=道具, 5=跳过)', 'info');
            logMessage('1057: 获取战斗状态', 'info');
        });
        document.getElementById('analyze-resources').addEventListener('click', () => {
            logMessage('资源获取相关命令分析:', 'info');
            logMessage('1172: 进入关卡(levelId指定关卡)', 'info');
            logMessage('279: 地图信息', 'info');
            logMessage('4354: 进入地图(mapId, viewId)', 'info');
        });
        document.getElementById('analyze-pvp').addEventListener('click', () => {
            logMessage('PVP相关命令分析:', 'info');
            logMessage('10042: 获取雇佣信息', 'info');
            logMessage('10043: 雇佣精灵', 'info');
        });
        document.getElementById('analyze-mihang').addEventListener('click', () => {
            logMessage('迷航相关命令分析:', 'info');
            logMessage('1120: 获取迷航状态', 'info');
            logMessage('1121: 开始迷航战斗', 'info');
            logMessage('1122: 设置迷航精灵配置', 'info');
        });
    };

    const addScriptAdvice = () => {
        const adviceDiv = document.createElement('div');
        adviceDiv.innerHTML = `
            <div style="margin-top: 10px; padding: 10px; border: 1px solid #00aaff; background: rgba(0, 20, 40, 0.3); border-radius: 6px;">
                <h4 style="color: #00aaff; margin-top: 0;">脚本维护建议</h4>
                <p style="color: #aaffaa; margin: 5px 0;">• 更新UI选择器<br>• 调整命令ID参数<br>• 修复异步逻辑</p>
            </div>
        `;
        document.getElementById('analysis-content').appendChild(adviceDiv);
    };

    const addExportFunction = () => {
        const exportDiv = document.createElement('div');
        exportDiv.innerHTML = `
            <div style="margin-top: 10px; padding: 10px; border: 1px solid #ffaa00; background: rgba(40, 20, 0, 0.3); border-radius: 6px;">
                <h4 style="color: #ffaa00; margin-top: 0;">数据导出</h4>
                <button id="export-data" style="background: #443300; color: white; border: 1px solid #ffaa00; padding: 5px 10px; cursor: pointer; border-radius: 4px;">导出捕获数据</button>
            </div>
        `;
        document.getElementById('analysis-content').appendChild(exportDiv);

        document.getElementById('export-data').addEventListener('click', () => {
            const dataStr = JSON.stringify(capturedPackets, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
            const exportFileDefaultName = `saiyuer_requests_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
            logMessage('💾 数据已导出', 'success');
        });
    };

    // 初始化所有模块
    //addCommandAnalysis();
    addScriptAdvice();
    //addExportFunction();
    addAutoResourceButton();
    addSpinWheelButton();
    addFightBossButton();
    // 初始日志
    createToggleBall();
    logMessage('✨ seer-daily-helper 已加载', 'success');
    logMessage('👉 点击“开始捕获”后，即可使用自动任务功能', 'info');
})();