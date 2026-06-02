import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseLiveEventLine, routeLiveCommentEvent } from './dist/index.js';

const logsDir = 'logs';
const logPrefix = 'live-chat-analysis-events-';
const routeLogPath = join(logsDir, `comment-router-decisions-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
const pollIntervalMs = 500;
const fromStart = process.argv.includes('--from-start');
const once = process.argv.includes('--once');

function findLatestAnalysisLog() {
    if (!existsSync(logsDir)) {
        return null;
    }

    const candidates = readdirSync(logsDir)
        .filter((fileName) => fileName.startsWith(logPrefix) && fileName.endsWith('.log'))
        .map((fileName) => {
            const filePath = join(logsDir, fileName);
            return {
                filePath,
                mtimeMs: statSync(filePath).mtimeMs
            };
        })
        .sort((left, right) => right.mtimeMs - left.mtimeMs);

    return candidates[0]?.filePath ?? null;
}

function formatDecision(decision) {
    return [
        `[router] action=${decision.action}`,
        `category=${decision.category}`,
        `priority=${decision.priority}`,
        `reason=${decision.reason}`,
        `source=${JSON.stringify(decision.event.raw)}`
    ].join(' ');
}

function routeLine(line) {
    const event = parseLiveEventLine(line);
    if (!event) {
        return;
    }

    const decision = routeLiveCommentEvent(event);
    const outputLine = formatDecision(decision);
    console.log(outputLine);
    appendFileSync(routeLogPath, `${outputLine}\n`, 'utf8');
}

function routeChunk(chunk, remainder, flush = false) {
    const parts = `${remainder}${chunk}`.split(/\r?\n/);
    const nextRemainder = parts.pop() ?? '';

    for (const line of parts) {
        if (line.trim()) {
            routeLine(line);
        }
    }

    if (flush && nextRemainder.trim()) {
        routeLine(nextRemainder);
        return '';
    }

    return nextRemainder;
}

const logPath = findLatestAnalysisLog();

if (!logPath) {
    console.error(`No ${logPrefix}*.log file found under ${logsDir}. Start live-chat.mjs first.`);
    process.exitCode = 1;
} else {
    console.log(`observing: ${logPath}`);
    console.log(`router decisions log: ${routeLogPath}`);

    let offset = fromStart ? 0 : statSync(logPath).size;
    let remainder = '';

    if (once) {
        routeChunk(readFileSync(logPath, 'utf8'), '', true);
        process.exit(0);
    }

    setInterval(() => {
        const size = statSync(logPath).size;
        if (size < offset) {
            offset = 0;
            remainder = '';
        }
        if (size === offset) {
            return;
        }

        const chunk = readFileSync(logPath).subarray(offset, size).toString('utf8');
        offset = size;
        remainder = routeChunk(chunk, remainder);
    }, pollIntervalMs);
}
