function getSmartDraft(count, excludeIds = new Set(), existingPlayers = [], isForce = false, rankFilter = null) {
    let pool = players.filter(p => p.status === 'waiting' && !p.isResting && !excludeIds.has(p.id));
    
    if (rankFilter) {
        const minIdx = RANK_LEVELS.indexOf(rankFilter.min);
        const maxIdx = RANK_LEVELS.indexOf(rankFilter.max);
        pool = pool.filter(p => {
            const pLevel = p.level || 'BG';
            const pIdx = RANK_LEVELS.indexOf(pLevel);
            return pIdx >= minIdx && pIdx <= maxIdx;
        });
    }

    pool.sort((a, b) => a.joinedQueueAt - b.joinedQueueAt); 
    if (pool.length === 0) return [];

    let targetScore = null, targetMMR = null;
    if (existingPlayers.length > 0) {
        targetScore = existingPlayers.reduce((sum, p) => sum + (RANK_SCORES[p.level||'BG']||1), 0);
        targetMMR = existingPlayers.reduce((sum, p) => sum + (p.mmr || 0), 0);
    }

    const head = pool[0];
    
    // 🚨 กฎเหล็ก Anti-Starvation: ถ้า C โดนสคิปมาแล้ว (skipCount >= 1) บังคับลงทันที ห้ามสคิปซ้ำ! 🚨
    if (head && head.skipCount >= 1 && !isForce) {
        let team = tryBuildTeam(head, pool, count, existingPlayers, true, targetScore, false, targetMMR);
        if (team.length === count) return team; 
    }

    if (isMMRMode && !isForce) {
        let captain = pool[0];
        let team = tryBuildTeam(captain, pool, count, existingPlayers, false, targetScore, false, targetMMR);
        if (team.length === count) return team;
        return [];
    }

    // 👻 โหมดหนีเจ้ากรรมนายเวร (Anti-Deja Vu)
    if (typeof isAntiDejaVuMode !== 'undefined' && isAntiDejaVuMode && existingPlayers.length > 0 && !isForce) {
        // ดึง 4 คิวแรกมาพิจารณา
        let candidates = pool.slice(0, 4);
        
        // เรียงลำดับตามคนที่ "เคยเจอพวกที่อยู่ในสนามน้อยที่สุด" (ยิ่งน้อยยิ่งได้เป็นกัปตันก่อน)
        candidates.sort((a, b) => {
            let conflictA = 0; existingPlayers.forEach(ex => conflictA += getOpponentCount(a.id, ex.id));
            let conflictB = 0; existingPlayers.forEach(ex => conflictB += getOpponentCount(b.id, ex.id));
            
            // ถ้า conflict เท่ากัน ให้วัดกันที่คิวใครมาก่อน
            if (conflictA !== conflictB) return conflictA - conflictB;
            return a.joinedQueueAt - b.joinedQueueAt; 
        });

        for (let i = 0; i < candidates.length; i++) {
            let captain = candidates[i];
            
            // เช็ค Rank กรณีที่เปิด Ranked Mode ซ้อนกันไว้
            if (isRankedMode) {
                 const capScore = RANK_SCORES[captain.level || 'BG'] || 1;
                 let isCompatible = true;
                 for(let ex of existingPlayers) {
                     const exScore = RANK_SCORES[ex.level || 'BG'] || 1;
                     if (Math.abs(capScore - exScore) >= 2) { isCompatible = false; break; }
                 }
                 if (!isCompatible) continue; 
            }
            let team = tryBuildTeam(captain, pool, count, existingPlayers, false, targetScore, isForce, targetMMR);
            if (team.length === count) {
                if (count === 4) return autoBalanceTeam(team);
                return team;
            }
        }
    }

    // --- โหมดปกติ (ไล่จากคิวแรกตามเดิม) ---
    for (let i = 0; i < pool.length; i++) {
        let captain = pool[i];
        if (!isForce && isRankedMode && existingPlayers.length > 0) {
             const capScore = RANK_SCORES[captain.level || 'BG'] || 1;
             let isCompatible = true;
             for(let ex of existingPlayers) {
                 const exScore = RANK_SCORES[ex.level || 'BG'] || 1;
                 if (Math.abs(capScore - exScore) >= 2) { isCompatible = false; break; }
             }
             if (!isCompatible) continue; 
        }
        let team = tryBuildTeam(captain, pool, count, existingPlayers, false, targetScore, isForce, targetMMR); 
        if (team.length === count) {
            if (count === 4 && !isForce) return autoBalanceTeam(team);
            return team;
        }
    }
    return [];
}

function tryBuildTeam(captain, currentPool, targetCount, existingPlayers = [], isPity = false, targetScore = null, isForce = false, targetMMR = null) {
    let selected = []; let usedIds = new Set();
    if (captain.bookingId) {
        const group = currentPool.filter(x => x.bookingId === captain.bookingId);
        if (group.length > targetCount) return [];
        group.sort((a, b) => (a.bookingTeam || 0) - (b.bookingTeam || 0));
        group.forEach(p => { selected.push(p); usedIds.add(p.id); });
    } else {
        selected.push(captain); usedIds.add(captain.id);
    }

    while (selected.length < targetCount) {
        let nextPlayer = null;
        if (selected.length % 2 !== 0 && !selected[selected.length-1].bookingId) {
            let currentSolo = selected[selected.length - 1];
            nextPlayer = findBestPartnerInfinite(currentSolo, currentPool, usedIds, existingPlayers, isPity, targetScore, isForce, targetMMR);
        } else {
            let currentTeamMMR = selected.reduce((s, p) => s + (p.mmr||0), 0);
            const effectiveTeam = [...selected, ...existingPlayers];
            nextPlayer = findBestOpponentInfinite(effectiveTeam, currentPool, usedIds, currentTeamMMR);
        }
        if (nextPlayer) { selected.push(nextPlayer); usedIds.add(nextPlayer.id); } else break; 
    }
    return selected;
}

function findBestPartnerInfinite(captain, fullPool, usedIds, rankCheckList = [], isPity = false, targetScore = null, isForce = false, targetMMR = null) {
    let best = null; let minScore = Infinity;
    const capScore = RANK_SCORES[captain.level || 'BG'] || 1;
    const capMMR = captain.mmr || 0;
    const capGender = captain.gender || 'M'; // 👈 เช็คเพศกัปตัน
   
    for (let i = 0; i < fullPool.length; i++) {
        const c = fullPool[i];
        if (c.id === captain.id || usedIds.has(c.id) || c.bookingId) continue;
        const cGender = c.gender || 'M';
        if (capGender === 'F' && cGender === 'F') continue;
        let finalScore = 0;

        if (isMMRMode && !isForce) {
            const queueCost = i * 100; 
            let mmrCost = 0;
            const partnerMMR = c.mmr || 0;
            if (targetMMR !== null) {
                const ourTeamMMR = capMMR + partnerMMR;
                mmrCost = Math.abs(ourTeamMMR - targetMMR) * 100;
            } else {
                mmrCost = Math.abs(capMMR - partnerMMR) * 100;
            }
            const pairCost = getPairCount(captain.id, c.id) * 1000000;
            finalScore = queueCost + mmrCost + pairCost;
        } else if (isForce) {
             const queueCost = i * 1000; 
             let balanceCost = 0;
             if (targetScore !== null) {
                const myTeamScore = capScore + (RANK_SCORES[c.level||'BG']||1);
                balanceCost = Math.abs(myTeamScore - targetScore) * 2500; 
             }
             const pairCost = getPairCount(captain.id, c.id) * 3000; 
             finalScore = queueCost + balanceCost + pairCost;
        } else {
             if (isPity && targetScore !== null) {
                 const cScore = RANK_SCORES[c.level || 'BG'] || 1;
                 const ourTeamSum = capScore + cScore;
                 finalScore = (getPairCount(captain.id, c.id) * 1000000) + (Math.abs(ourTeamSum - targetScore) * 1000) + i;
            } else {
                const pairPenalty = (getPairCount(captain.id, c.id) >= 2) ? 999999999 : getPairCount(captain.id, c.id) * 1000000;
                let rankPenalty = 0;
                if (isRankedMode) {
                    const cScore = RANK_SCORES[c.level || 'BG'] || 1;
                    const diffCap = Math.abs(capScore - cScore);
                    if (diffCap === 1) rankPenalty += 5;
                    if (diffCap >= 2) rankPenalty += 500;
                    for(let existing of rankCheckList) {
                        const exScore = RANK_SCORES[existing.level || 'BG'] || 1;
                        const diffEx = Math.abs(cScore - exScore);
                        if (diffEx === 1) rankPenalty += 5; else if (diffEx >= 2) rankPenalty += 500;
                    }
                }
                finalScore = pairPenalty + rankPenalty + i;
            }
        }
        if (finalScore < minScore) { minScore = finalScore; best = c; }
    }
    return best;
}

function findBestOpponentInfinite(currentTeam, fullPool, usedIds, targetMMR = null) {
    let best = null; let minScore = Infinity;
    for (let i = 0; i < fullPool.length; i++) {
        const c = fullPool[i];
        if (usedIds.has(c.id) || c.bookingId) continue;
        let conflictScore = 0;
        currentTeam.forEach(member => {
            const opCount = getOpponentCount(member.id, c.id);
            conflictScore += (opCount >= 2) ? 100000000 : (opCount * 1000000);
        });
        let extraScore = 0;
        let rankPenalty = 0;

        if (isMMRMode) {
            if (targetMMR !== null) {
                const myMMR = c.mmr || 0;
                const projectedTeam2MMR = myMMR * 2; 
                extraScore = Math.abs(projectedTeam2MMR - targetMMR) * 100;
            }
        } else if (isRankedMode) {
            const cScore = RANK_SCORES[c.level || 'BG'] || 1;
            let maxDiff = 0;
            currentTeam.forEach(member => {
                const mScore = RANK_SCORES[member.level || 'BG'] || 1;
                const diff = Math.abs(mScore - cScore);
                if (diff > maxDiff) maxDiff = diff;
            });
            if (maxDiff === 1) rankPenalty = 5;
            else if (maxDiff >= 2) rankPenalty = 500;
        }
        const totalScore = conflictScore + extraScore + rankPenalty + i;
        if (totalScore < minScore) { minScore = totalScore; best = c; }
    }
    return best;
}

const autoBalanceTeam = (candidates) => {
    if (candidates.some(p => p.bookingId) || candidates.length !== 4) return candidates;

    const combinations = [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]];
    let bestCombo = combinations[0];
    let minDiffScore = Infinity;

    combinations.forEach(combo => {
        const p1 = candidates[combo[0]]; const p2 = candidates[combo[1]];
        const p3 = candidates[combo[2]]; const p4 = candidates[combo[3]];

        const team1Power = getPlayerPower(p1) + getPlayerPower(p2);
        const team2Power = getPlayerPower(p3) + getPlayerPower(p4);
        const powerDiff = Math.abs(team1Power - team2Power) * 1000; 

        const team1WinRate = getWinRate(p1) + getWinRate(p2);
        const team2WinRate = getWinRate(p3) + getWinRate(p4);
        const winRateDiff = Math.abs(team1WinRate - team2WinRate);

        let repeatPenalty = 0;
        if (getPairCount(p1.id, p2.id) > 0) repeatPenalty += 500;
        if (getPairCount(p3.id, p4.id) > 0) repeatPenalty += 500;

        const totalBadness = powerDiff + repeatPenalty + winRateDiff;

        if (totalBadness < minDiffScore) {
            minDiffScore = totalBadness;
            bestCombo = combo;
        }
    });
return [candidates[bestCombo], candidates[bestCombo], candidates[bestCombo], candidates[bestCombo]];
};

  function getPlayerPower(p) {
    const baseScore = RANK_SCORES[p.level || 'BG'] || 1;
    const streakPenalty = (p.winStreak >= 3) ? 0.5 : 0;
    return baseScore + streakPenalty;
}
