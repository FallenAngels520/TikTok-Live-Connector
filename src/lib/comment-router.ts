export type LiveCommentEventType =
    | 'chat'
    | 'gift'
    | 'follow'
    | 'share'
    | 'like'
    | 'member'
    | 'roomUser'
    | 'subscribe';

export type LiveCommentEvent = {
    time: string;
    type: LiveCommentEventType;
    user?: string;
    message: string;
    raw: string;
};

export type CommentRouteAction = 'send_to_hermes' | 'buffer' | 'ignore';
export type CommentRouteCategory = 'chat' | 'monetary' | 'engagement' | 'room_signal';

export type CommentRouteDecision = {
    action: CommentRouteAction;
    category: CommentRouteCategory;
    priority: number;
    reason: string;
    event: LiveCommentEvent;
    hermesInput?: {
        eventType: LiveCommentEventType;
        targetUser?: string;
        content: string;
        instruction: string;
    };
};

const linePattern = /^\[(?<time>\d{2}:\d{2}:\d{2})\] \[(?<type>[^\]]+)\] (?<body>.*)$/;
const supportedEventTypes = new Set<LiveCommentEventType>([
    'chat',
    'gift',
    'follow',
    'share',
    'like',
    'member',
    'roomUser',
    'subscribe'
]);

export function parseLiveEventLine(line: string): LiveCommentEvent | null {
    const match = line.match(linePattern);
    const groups = match?.groups;

    if (!groups) {
        return null;
    }

    const type = groups.type as LiveCommentEventType;
    if (!supportedEventTypes.has(type)) {
        return null;
    }

    const body = groups.body.trim();

    if (type === 'chat') {
        const separatorIndex = body.indexOf(': ');
        if (separatorIndex < 0) {
            return {
                time: groups.time,
                type,
                message: body,
                raw: line
            };
        }

        return {
            time: groups.time,
            type,
            user: body.slice(0, separatorIndex),
            message: body.slice(separatorIndex + 2),
            raw: line
        };
    }

    const user = parseUserForEvent(type, body);

    return {
        time: groups.time,
        type,
        ...(user ? { user } : {}),
        message: body,
        raw: line
    };
}

export function routeLiveCommentEvent(event: LiveCommentEvent): CommentRouteDecision {
    switch (event.type) {
        case 'chat':
            return routeChatEvent(event);
        case 'gift':
        case 'subscribe':
            return sendToHermes(event, 'monetary', 90, event.type, 'Handle this high-value live interaction naturally and briefly.');
        case 'follow':
        case 'share':
        case 'like':
        case 'member':
            return bufferEvent(event, 'engagement', 30, event.type);
        case 'roomUser':
            return bufferEvent(event, 'room_signal', 20, 'room_status');
        default:
            return ignoreEvent(event, 'chat', 'unsupported_event');
    }
}

function routeChatEvent(event: LiveCommentEvent): CommentRouteDecision {
    const text = event.message.trim();

    if (!text) {
        return ignoreEvent(event, 'chat', 'empty_chat');
    }

    if (isViewerToViewerChat(text)) {
        return ignoreEvent(event, 'chat', 'viewer_to_viewer_chat');
    }

    if (isLowValueChat(text)) {
        return ignoreEvent(event, 'chat', 'low_value_chat');
    }

    return sendToHermes(event, 'chat', 70, 'chat_candidate', 'Decide whether this live chat deserves a natural streamer reply. Keep any reply short.');
}

function sendToHermes(
    event: LiveCommentEvent,
    category: CommentRouteCategory,
    priority: number,
    reason: string,
    instruction: string
): CommentRouteDecision {
    return {
        action: 'send_to_hermes',
        category,
        priority,
        reason,
        event,
        hermesInput: {
            eventType: event.type,
            ...(event.user ? { targetUser: event.user } : {}),
            content: event.message,
            instruction
        }
    };
}

function bufferEvent(
    event: LiveCommentEvent,
    category: CommentRouteCategory,
    priority: number,
    reason: string
): CommentRouteDecision {
    return {
        action: 'buffer',
        category,
        priority,
        reason,
        event
    };
}

function ignoreEvent(
    event: LiveCommentEvent,
    category: CommentRouteCategory,
    reason: string
): CommentRouteDecision {
    return {
        action: 'ignore',
        category,
        priority: 0,
        reason,
        event
    };
}

function parseUserForEvent(type: LiveCommentEventType, body: string): string | undefined {
    switch (type) {
        case 'gift':
            return body.split(' sent ')[0] || undefined;
        case 'like':
            return body.split(' liked ')[0] || undefined;
        case 'follow':
            return body.split(' followed ')[0] || undefined;
        case 'share':
            return body.split(' shared ')[0] || undefined;
        case 'member':
            return body.split(' joined')[0] || undefined;
        case 'subscribe':
            return body.split(' subscribed')[0] || undefined;
        default:
            return undefined;
    }
}

function isViewerToViewerChat(text: string): boolean {
    return text.startsWith('@') && text.length <= 24 && !text.includes('?');
}

function isLowValueChat(text: string): boolean {
    return text.length < 4;
}
