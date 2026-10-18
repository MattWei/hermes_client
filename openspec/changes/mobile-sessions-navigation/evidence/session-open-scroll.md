# Opening a session lands at its last message

A resumed conversation opened at its first message: the transcript is a scroll container, and nothing set
its scroll position, so a long session started at the top and had to be dragged to the bottom to see the
reply.

## What was done

`IpadSessionDetail` keeps the conversation in a ref and, when the session id changes, sets
`scrollTop = scrollHeight` on **that one element**:

```tsx
if (openSession.current !== sessionId) { openSession.current = sessionId; followTail.current = true }
if (followTail.current) conversation.scrollTop = conversation.scrollHeight
```

Three details that are not incidental:

- **Not `scrollIntoView`.** The desktop's `composer/trigger-popover.tsx` warns that it operates on every
  scrollable ancestor, which drags the transcript *and* the shell. Setting `scrollTop` on the one scroller
  cannot move anything else.
- **Re-runs on `messages.length`.** The session id is known before its transcript is: on resume the pane
  renders empty, then the messages arrive. Scrolling only on the id change would scroll an empty box.
- **The gesture is respected.** `followTail` is updated from the element's own `onScroll` — within 48px of
  the bottom counts as following. Someone who scrolled up to read history is not yanked back when a turn
  completes.

## A turn in progress follows itself

Sending is a request to watch the answer. A person who had scrolled up to read history was left where they
were: the re-armed tail never happened, so the reply landed below the fold.

`followTail` is re-armed when a **new** message arrives whose role is `user` — keyed on the message id, so
one send re-arms once and scrolling up *during* the turn still sticks:

```tsx
if (lastMessageId && lastMessageId !== lastSeenMessage.current) {
  lastSeenMessage.current = lastMessageId
  if (lastMessageRole === 'user') followTail.current = true
}
```

Tool activity moved **inside** the transcript, after the messages. As a sibling above the scroll container it
pushed the conversation down and rendered at the top of the screen — a running turn looked like the session's
history rather than its latest step. Inside the container it sits where it happened and scrolls with it, and
`toolActivities.length` is a dependency of the follow effect so each completed step keeps the view pinned.

Verified: 21 files / 182 tests, `tsc` clean, built and installed on the iPhone 13 Pro.

## Verification

`src/ipad-session-detail.test.tsx` renders the detail view, stubs `scrollHeight`, switches the session id
and expects `scrollTop` to equal the full height. jsdom has no layout, so this covers the effect wiring,
not the pixels — the visual check is on the device.
