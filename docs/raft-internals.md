# Raft Internals

This document describes the internal operation of the Raft consensus implementation used by this project. It connects the Raft protocol to the actual TypeScript classes, fields, HTTP routes, persistence files, and tests in this repository. Where the implementation is intentionally simpler than production Raft, that difference is called out explicitly.

## 1. What Problem Does Raft Solve?

Distributed nodes can receive the same client operation at different times, lose messages, crash, or continue operating after a network partition. Without a common ordering, node 1 might apply `SET x=10` while node 2 applies `SET x=20`; the cluster no longer represents one key-value store.

Consensus means that nodes agree on one ordered sequence of commands. Raft provides:

- leader election;
- a replicated, ordered log;
- majority-based commitment;
- rules for rejecting stale leaders and conflicting logs; and
- deterministic state-machine application.

Raft does not make the network reliable, prevent crashes, provide encryption or authentication, or guarantee availability when a majority is unavailable. It also does not make arbitrary application code deterministic.

For this project's three nodes, a write is safe when two nodes, including the leader, have the log entry. If node 3 is down, nodes 1 and 2 can still commit. If nodes 2 and 3 are unavailable, node 1 may append locally but cannot commit the write.

## 2. Distributed System Model

The backend is an Express process containing one `RaftNode`, one `StateMachine`, and two JSON-file storage adapters. `docker-compose.yml` runs three such processes:

```text
Client / dashboard
	|
	v
  HTTP API on any node
	|
	v
  Raft cluster: node1:5001, node2:5002, node3:5003
	|
	+---- RaftNode: local log, term, role, timers
	+---- StateMachine: SET and DELETE application data
	+---- FileStorage: raft-state.json
	+---- DataStorage: actual-data.json
```

Nodes communicate over HTTP. The internal routes are `POST /internal/request-vote` and `POST /internal/append-entries`. A leader sends `AppendEntries` to followers; followers use `leaderId` to forward client KV requests toward the known leader. Each node has its own Docker volume, so its persisted state is local to that node.

The replicated log is the ordered durable history. The state machine is the materialized key-value result of applying committed log entries in order. Persistence keeps Raft metadata and application data across normal container restarts, although the file writes are not atomic.

## 3. Nodes

A node is a `RaftNode` created in `src/index.ts` from `loadConfig()` in `src/node/config.ts`. Its identity is `NODE_ID`; its listening port is `PORT`; and its peer list comes from the comma-separated `PEERS` environment variable.

Important `RaftNode` fields are:

| Category | Actual fields | Purpose |
| --- | --- | --- |
| Identity | `nodeId`, `port`, `peers` | Identify this process and its peers. |
| Persistent Raft state | `currentTerm`, `votedFor`, `log`, `commitIndex`, `lastApplied` | Recovered from `raft-state.json`. |
| Volatile replication state | `nextIndex`, `matchIndex` | Per-follower progress maintained by a leader. |
| Role state | `state`, `leaderId` | `FOLLOWER`, `CANDIDATE`, or `LEADER`, plus known leader. |
| Timer state | `electionTimer`, `heartbeatTimer` | Detect leader loss and send periodic replication. |

The deployed cluster is:

| Node ID | Docker service | Port | Peers |
| --- | --- | --- | --- |
| `node1` | `node1` | 5001 | `node2`, `node3` |
| `node2` | `node2` | 5002 | `node1`, `node3` |
| `node3` | `node3` | 5003 | `node1`, `node2` |

The quorum formula is `Math.floor((peers.length + 1) / 2) + 1`. The code can be configured with other peer counts, but Docker Compose and the tests use three nodes and there is no membership-change protocol.

## 4. Follower

A follower is the passive role. A new `RaftNode` starts with `state = FOLLOWER`, `currentTerm = 0`, no vote, and an empty log. It accepts `RequestVote` and `AppendEntries` RPCs, resets its election timer when it grants a vote or accepts a leader message, and applies committed entries.

`ElectionTimer` randomizes a timeout between 1,500 and 3,000 ms by default. If the timer expires and the node is not a leader, its callback calls `startElection()`. A valid same-or-higher-term `AppendEntries` also changes a candidate or old leader into a follower and records `leaderId`.

```text
FOLLOWER
   | AppendEntries or granted vote
   | reset election timer
   v
FOLLOWER
   |
   | no valid leader message before timeout
   v
CANDIDATE
```

Followers receive empty `AppendEntries` as heartbeats and non-empty `AppendEntries` as replication. An older-term message is rejected and does not establish leadership.

## 5. Candidate

The exact election path in `startElection()` is:

```text
Follower
  -> election timeout
  -> Candidate
  -> currentTerm++
  -> votedFor = nodeId
  -> persist()
  -> RequestVote to every peer
  -> count self-vote and granted votes
  -> majority
  -> Leader
```

The implementation stops the election timer before campaigning, sets `electionInProgress`, and waits for all `Promise.all()` vote requests. Requests use the term captured as `electionTerm`.

- With a majority, `becomeLeader()` stops the election timer, initializes `nextIndex` and `matchIndex`, and starts heartbeats.
- A response with a higher term makes the candidate a follower, clears `votedFor`, persists, and resets the timer.
- If the candidate does not reach a majority, it resets the election timer.
- A split vote leaves no candidate with enough votes; a later timeout starts a new term and a new contest.

The implementation does not stop the vote collection early after a majority is mathematically reached; it waits for all requests or their 1,000 ms RPC timeouts.

## 6. Leader

A candidate becomes leader only after the quorum calculation succeeds. The leader is the serialization point for writes. `set()` and `delete()` reject locally when the node is not leader, and the HTTP layer forwards those requests to the known `leaderId`.

Leader responsibilities are:

1. append client commands to its own log;
2. replicate them with `AppendEntries`;
3. track each follower using `nextIndex` and `matchIndex`;
4. advance `commitIndex` after a majority has the entry;
5. apply committed entries through `applyCommittedEntries()`; and
6. send heartbeats so followers do not start competing elections.

`becomeLeader()` starts a 500 ms heartbeat interval. Each interval calls `replicateToPeer()` for every peer, so the same mechanism sends either missing entries or an empty heartbeat. Clients normally use the leader because only it appends and commits writes, and it can reject stale leadership using the current term and majority replication.

## 7. Terms

A term is a monotonically increasing logical period. It identifies an election era and is stored in `currentTerm`; each `LogEntry` also stores the term in which it was created.

Terms solve stale-message problems. For example, if node 1 was leader in term 3 but became isolated, node 2 can win term 4. When node 1 later receives term 4 in `AppendEntries` or a vote response, it adopts term 4, becomes a follower, clears `votedFor`, persists, and stops heartbeats where applicable.

- A follower receiving a smaller request term rejects it.
- A node receiving a larger request term updates its term and follows the newer election era.
- A candidate's vote is tied to its election term.
- A log entry's term helps distinguish entries at the same index created by different leaders.

Terms are not timestamps and are not wall-clock time. They are protocol epochs that let nodes recognize obsolete leaders and responses.

## 8. Election Timeout

An election timeout is the maximum period a follower waits for evidence of a leader. `ElectionTimer.reset()` cancels the old timer and chooses an integer uniformly between the configured minimum and maximum. The defaults are 1,500 and 3,000 ms.

Randomization matters because if all followers timed out together, they could all become candidates and split the vote repeatedly. Different timeouts make one node more likely to campaign first, while the leader's 500 ms heartbeats usually reset the other timers before they expire.

When the timeout expires, the callback checks `state !== LEADER` and invokes `startElection()`. That method stops the timer, increments the term, self-votes, persists, and sends `RequestVote`. A successful election starts heartbeats; an unsuccessful one resets the randomized timer. `RequestVote` grants and accepted `AppendEntries` reset the timer.

## 9. Heartbeats

In Raft, a heartbeat is an `AppendEntries` RPC whose `entries` array is empty. This project does exactly that: `sendHeartbeats()` calls `replicateToPeer()`, which builds `AppendEntries` using the follower's `nextIndex`; when the follower is caught up, `entries` is empty.

The leader sends heartbeats to:

- prove that it is still active;
- reset followers' election timers;
- discover a higher term; and
- carry a newer `leaderCommit` value so followers can apply entries.

Follower handling sets `state = FOLLOWER`, records `leaderId`, and calls `electionTimer.reset()` before validating the previous log position. A heartbeat with an invalid previous position can still reset the timer because that is the current control flow; the response is then `success: false` and the leader repairs the log.

Example timeline:

```text
0 ms       node1 is elected leader in term 2
500 ms     node1 -> node2: AppendEntries(entries=[])
500 ms     node1 -> node3: AppendEntries(entries=[])
500 ms     followers reset election timers
1000 ms    next heartbeat repeats
> timeout  if heartbeats stop, a follower starts an election
```

The leader's read path also sends empty `AppendEntries` through `confirmLeadership()` and requires a majority response. This is a project-specific read check, not a full formal linearizability proof.

## 10. Leader Election

The complete sequence is:

1. A follower waits for heartbeats or a granted vote.
2. Its randomized election timeout expires.
3. `startElection()` changes it to `CANDIDATE`.
4. It increments `currentTerm`.
5. It votes for itself and persists.
6. It sends `RequestVote` to all configured peers.
7. Each receiver checks the request term, one-vote rule, and log freshness.
8. The candidate counts its own vote plus granted responses.
9. At least two votes in the three-node deployment calls `becomeLeader()`.
10. The new leader starts 500 ms heartbeat/replication calls.

If nodes 1 and 2 both campaign in the same term, node 3 can vote for only one of them and each candidate may have only one or two votes. A candidate without two votes resets its timer. A later candidate in a higher term can collect fresh votes and resolve the split.

## 11. RequestVote RPC

The TypeScript contract is defined in `src/raft/rpc.ts`:

| Field | Meaning | Receiver use |
| --- | --- | --- |
| `term` | Candidate's election term | Reject if lower; adopt if higher. |
| `candidateId` | Node asking for the vote | Store in `votedFor` when granting. |
| `lastLogIndex` | Candidate's last log index | Compare log length when last terms match. |
| `lastLogTerm` | Term of candidate's last entry, or `0` for an empty log | Primary log-freshness comparison. |

The response is `{ term, voteGranted }`. A request sent by `requestVoteFromPeer()` looks like:

```json
{
  "term": 3,
  "candidateId": "node2",
  "lastLogIndex": 4,
  "lastLogTerm": 3
}
```

An example response is:

```json
{
  "term": 3,
  "voteGranted": true
}
```

The endpoint is `POST /internal/request-vote`. The route passes `req.body` directly to `handleRequestVote()`; there is no schema validation or peer authentication at the HTTP boundary.

## 12. Voting Rules

`handleRequestVote()` first rejects a request with `request.term < currentTerm`. For a higher term it updates `currentTerm`, becomes a follower, clears `votedFor`, and persists. It grants the vote only when:

```text
(votedFor is empty OR votedFor is candidateId)
AND candidate log is at least as up to date
```

This enforces one vote per term. The receiver persists the vote and resets its election timer after granting it. A request is rejected when the node already voted for another candidate or the candidate log is older.

The log freshness rule in `isCandidateLogUpToDate()` is the Raft rule: compare `lastLogTerm` first; if terms differ, the higher term is newer. If terms match, the greater or equal `lastLogIndex` is newer. This prevents a candidate missing a newer log suffix from becoming leader and potentially overwriting committed history.

## 13. Majority / Quorum

For three nodes:

```text
majority = floor(3 / 2) + 1 = 2
```

The leader counts itself, so one follower acknowledgement is enough for a write. One of three is not enough because a separate side of a partition could also contain one node. Any two-node quorum intersects every other two-node quorum in at least one node; that intersection carries the protocol's shared voting and log history.

For example, `{node1, node2}` and `{node2, node3}` overlap at node 2. Two leaders cannot both safely collect disjoint majorities in the same three-node term. The code uses the same majority formula for elections, writes, and leadership confirmation.

## 14. Split Vote

A split vote occurs when candidates campaign before hearing one another:

```text
Node 1 -> votes for Node 1
Node 2 -> votes for Node 2
Node 3 -> votes for one candidate, or has already voted
```

If neither candidate reaches two votes, neither becomes leader. The candidates reset their election timers. The next timeout starts another term, and randomized delays usually let one candidate send requests first and receive a majority.

The implementation also ignores an election result that is no longer relevant: after `Promise.all()` returns, it checks that the node is still a candidate and that `currentTerm` still equals `electionTerm`.

## 15. Replicated Log

A log entry is the `LogEntry` interface: an `index`, a creation `term`, and a command. Commands are `SET` with a key/value or `DELETE` with a key; either may include `requestId`.

```text
Index | Term | Command
------+------|------------
1     | 1    | SET a=10
2     | 1    | SET b=20
3     | 2    | DELETE a
```

The leader's log is the source from which followers are synchronized. Entries must remain ordered because the state machine applies commands sequentially. Applying `SET a=10` then `DELETE a` is not equivalent to applying them in reverse order.

`handleAppendEntries()` checks the previous entry, truncates a conflicting suffix, appends missing entries, persists, and applies committed entries. Replication sends at most 64 entries per HTTP request.

## 16. Log Index

An index identifies an entry's position. This implementation uses one-based indexes: the first entry has `index: 1` and is stored at JavaScript array position `0`. An empty log has last index `0`, and `getLastLogTerm()` returns `0` for it. The previous-entry check translates `prevLogIndex` to `this.log[prevLogIndex - 1]`.

The leader uses the index to choose a slice beginning at `nextIndex - 1`, followers use it to locate an existing entry, and `commitIndex`/`lastApplied` refer to the highest one-based position known committed or applied.

## 17. Log Term

The term in a log entry says which election era created it. An index alone is insufficient: two leaders can both have an entry at index 2 but have created different commands in terms 1 and 2. `prevLogIndex` and `prevLogTerm` together identify the exact history prefix that the leader expects.

For example, a follower with `2: term 1, SET x=old` must reject an AppendEntries that says the previous entry is index 2, term 2. The index matches but the history does not. The leader then moves `nextIndex` backward and retries with an earlier prefix.

## 18. AppendEntries RPC

The contract in `src/raft/rpc.ts` is:

| Field | Sender | Receiver behavior |
| --- | --- | --- |
| `term` | Leader | Reject if stale; adopt if higher. |
| `leaderId` | Leader | Store as `leaderId` for forwarding and health reporting. |
| `prevLogIndex` | Leader | Identify the log entry immediately before this batch. |
| `prevLogTerm` | Leader | Validate the term at `prevLogIndex`. |
| `entries` | Leader | Empty for a heartbeat; otherwise entries to append. |
| `leaderCommit` | Leader | Advance follower `commitIndex` up to this value and local log length. |

The response is `{ term, success }`. A request goes to `POST /internal/append-entries`.

For empty `entries`, the request is a heartbeat. For non-empty `entries`, the follower validates the prefix, removes a conflicting suffix when needed, appends missing entries, persists, and applies entries up to the received commit index.

## 19. prevLogIndex

`prevLogIndex` is the index immediately before the first entry in the AppendEntries batch. Suppose:

```text
Leader:   1:A  2:B  3:C
Follower: 1:A  2:B
```

The leader's `nextIndex` for this follower is 3, so it sends:

```json
{
  "prevLogIndex": 2,
  "prevLogTerm": "term of entry 2",
  "entries": ["entry 3: C"]
}
```

The follower checks its entry at index 2 before appending index 3. If the follower has no index 2, it returns `success: false` and the leader backs up.

## 20. prevLogTerm

`prevLogTerm` is needed because the same index may contain different histories. Consider:

```text
Leader:   1(term 1):A  2(term 3):B  3(term 3):C
Follower: 1(term 1):A  2(term 2):X
```

Sending `prevLogIndex: 2` without the term would make the follower appear compatible. Sending `prevLogTerm: 3` exposes the conflict. The follower compares both values and rejects the request when either the index is absent or the term differs. These two fields are the log consistency check at the boundary between existing history and new entries.

## 21. Log Conflicts

With:

```text
Leader:   1:A  2:B  3:C
Follower: 1:A  2:X
```

the leader eventually sends a batch whose previous entry matches the common prefix. If the follower rejects because its previous term differs, `replicateToPeerInternal()` decreases `nextIndex` by up to 64, with a lower bound of 1, and retries. Once the previous entry matches, `handleAppendEntries()` sees the different term at an incoming index, executes `this.log.splice(entry.index - 1)`, and then appends the leader's entry and subsequent missing entries.

This repairs both a missing suffix and a conflicting suffix. It is a simplified backtracking strategy rather than the optimized conflict-term hints used by some Raft implementations. Failed writes can leave uncommitted entries in the old leader's local log; later leader replication is responsible for replacing such entries.

## 22. nextIndex

`nextIndex` is a leader-side map from peer ID to the next log index that should be sent to that peer. When `becomeLeader()` runs, every peer starts at `log.length + 1`, meaning the leader initially assumes the follower is caught up.

After a successful AppendEntries, the leader sets `nextIndex` to one beyond the last sent index. After a previous-log mismatch, it sets:

```text
nextIndex = max(1, nextIndex - 64)
```

and retries. For a follower with entries 1-3 while the leader has 1-6, a failed attempt can move the next index backward; a successful batch then sends the missing suffix and advances it again. This is how a lagging or conflicting follower converges without a separate recovery protocol.

## 23. matchIndex

`matchIndex` is the highest log index the leader knows a follower has replicated successfully. It starts at `0` for each peer in `becomeLeader()` and advances to `lastSentIndex` after a successful response.

The distinction is:

| Field | Meaning |
| --- | --- |
| `nextIndex` | Where the next attempted batch begins. |
| `matchIndex` | Highest index known to be present on that follower. |

For example, if the leader has six entries and node 2 acknowledged through index 4, `matchIndex[node2] = 4` and `nextIndex[node2] = 5`. The leader uses all `matchIndex` values, plus its own log length, to find the index replicated on a majority.

## 24. Commit Index

`commitIndex` is the highest log index known to be committed. Committed means a majority has replicated the entry and the leader is allowed to expose it through state-machine application.

Appending locally or receiving one follower copy is not enough. `updateCommitIndex()` sorts the leader's log length and follower `matchIndex` values, chooses the median quorum position, and advances only when the entry at that position belongs to `currentTerm`. The leader then calls `applyCommittedEntries()` and sends the newer `leaderCommit` in later replication calls or heartbeats.

Followers set their own commit index to `min(leaderCommit, log.length)` and apply entries sequentially.

## 25. Committed vs Appended

Appending and committing are different events:

```text
Leader appends entry locally
	|
	v
One follower receives it: 2/3 copies exist
	|
	v
Majority achieved
	|
	v
commitIndex advances
	|
	v
State machine applies the entry
```

In a three-node cluster, a leader-only entry is appended but not committed. The tests explicitly verify that losing both followers leaves the entry in the leader's log while `commitIndex` remains 0 and the state machine does not apply it. This distinction matters because an uncommitted entry can be replaced by a later leader, while a committed entry must remain part of the common history.

## 26. Current-Term Commit Rule

Standard Raft does not directly commit an old-term entry merely because it appears on a majority. A current leader first commits an entry from its own term; once that current-term entry is committed, earlier entries become committed indirectly because the log is ordered and the prefix is replicated.

This implementation does enforce the direct rule in `updateCommitIndex()`:

```ts
if (entry.term !== this.currentTerm) {
    return;
}
```

Therefore an old-term majority index alone does not advance `commitIndex`. Once a current-term entry reaches a majority, the selected majority index can advance and `applyCommittedEntries()` applies the prefix in order. This is one of the places where the implementation follows the important textbook safety rule rather than using a simple majority-only shortcut.

## 27. lastApplied

`commitIndex` says how far the protocol knows it is safe to apply. `lastApplied` says how far this node has actually applied to its state machine.

```text
commitIndex advances
	|
	v
while (lastApplied < commitIndex)
	|
	v
apply log[lastApplied] in order
	|
	v
lastApplied catches up
```

`applyCommittedEntries()` increments `lastApplied` one entry at a time, applies `SET` or `DELETE`, records a request ID, and persists the updated Raft state. Keeping these indexes separate allows replication and commitment to proceed before application finishes.

## 28. State Machine

The state machine is `StateMachine` in `src/state-machine/StateMachine.ts`. It stores key/value data in a `Record<string, string>` and persists it through `DataStorage` to `/app/data/actual-data.json`.

- A `SET` command calls `stateMachine.set(key, value)`.
- A `DELETE` command calls `stateMachine.delete(key)`.
- `get()` reads the materialized value.

Every node applies the same committed commands in the same log order. If all commands are deterministic, their materialized state becomes identical. The application itself does not execute an uncommitted command.

## 29. Complete Write Flow

For `SET key=value`:

```text
Client
  -> PUT /kv/key
Leader's RaftNode.set()
  -> append LogEntry { index, term, command: SET }
  -> persist raft-state.json
  -> AppendEntries to followers
  -> majority acknowledgement
  -> updateCommitIndex()
  -> applyCommittedEntries()
  -> StateMachine.set()
  -> response { success: true, index }
```

`set()` is serialized through `writeQueue`, so leader writes append in a controlled order. `replicateEntry()` counts the leader as one replica, waits for enough `replicateToPeer()` results, updates the commit index, and sends another replication round so followers receive the new `leaderCommit`. If no majority is available, the method returns failure; the locally persisted log entry remains uncommitted.

## 30. Follower -> Leader Forwarding

The Express handlers check `raftNode.getState()`. A follower does not serve KV reads or writes from its local state. It calls `forwardToLeader()`, which reads `raftNode.getLeaderId()`, maps that ID through `config.addresses`, and forwards to `http://leader/kv/:key`.

```text
Client
  -> follower /kv/key
  -> known leader /kv/key
  -> leader replication and commit
  -> leader response
  -> follower preserves status and JSON body
  -> client
```

If no leader is known or its address is absent, the follower returns `503` with `{ success: false, leader: null }`. If the leader is unavailable during the forwarding fetch, the route has no explicit local timeout/error mapping. A stale `leaderId` can also exist temporarily because higher-term handling does not consistently clear it.

## 31. Request IDs / Idempotency

Networks can lose a response after the server has committed a request. The client then retries, and without a logical request identity the retry looks like a new command.

The KV API accepts optional `requestId` values. The ID is stored inside the log command. After a committed entry is applied, `applyCommittedEntries()` calls `recordProcessedRequest(requestId, { success: true, index })`. A later `set()` or `delete()` checks `getProcessedRequest()` and returns the original result instead of appending another command. Reusing an ID with a different value also returns the first result; the ID is treated as the operation identity.

```text
requestId = abc123, SET balance=500
	|
	v
response lost; client retries abc123
	|
	v
processedRequests contains abc123
	|
	v
return original result/index, do not append again
```

This is application-level deduplication, not a universal exactly-once guarantee. IDs are optional, the map is in memory rather than a separate file, and concurrent duplicate lookups occur before entering `writeQueue` (although the repository's concurrency tests pass). On restart, `initialize()` reconstructs IDs from applied log entries, but it does not reconstruct missing application data from the log.

## 32. Persistence

`FileStorage` writes `/app/data/raft-state.json` with:

```json
{
  "currentTerm": 2,
  "votedFor": "node1",
  "log": [],
  "commitIndex": 0,
  "lastApplied": 0
}
```

The actual persisted fields are `currentTerm`, `votedFor`, `log`, `commitIndex`, and `lastApplied`, as defined by `RaftPersistentState`. `DataStorage` separately writes application data to `/app/data/actual-data.json`. `src/index.ts` creates both stores using the same data directory.

Persistence prevents a restarted node from forgetting a term, voting twice in one term, or losing its log position. Docker named volumes preserve each node's directory. The implementation uses ordinary `fs.writeFile`; it has no atomic rename, write-ahead log, checksum, or corruption recovery. Missing files load as empty state, while malformed JSON throws.

## 33. Crash Recovery

The normal restart sequence is:

```text
Node running
  -> crash or SIGTERM
  -> Docker volume keeps JSON files
  -> process constructs FileStorage/DataStorage
  -> RaftNode.initialize() restores Raft fields
  -> StateMachine.initialize() loads actual-data.json
  -> election timer starts
  -> node rejoins as follower and catches up
```

`initialize()` restores `currentTerm`, `votedFor`, `log`, `commitIndex`, and `lastApplied`, then rebuilds processed request IDs from entries through `lastApplied`. A node with an outdated log catches up through normal `AppendEntries` and `nextIndex` backtracking.

A limitation is important: if `actual-data.json` is missing but `raft-state.json` says entries were already applied, initialization does not replay those entries into the state machine. The log and indexes survive, but the materialized application data is not independently reconstructed.

## 34. Leader Failure

The failure sequence is:

```text
Leader fails
  -> heartbeats stop
  -> followers' randomized timers expire
  -> candidate increments term and requests votes
  -> a surviving majority elects a new leader
  -> new leader initializes replication progress
  -> old or lagging nodes synchronize
```

An uncommitted entry from the failed leader is not applied merely because it was locally appended. A new leader with a different log can cause it to be truncated when the consistency check finds a conflicting term. The tests cover a failed leader, continued writes with one follower down, and the rule that minority-side entries are not committed.

## 35. Majority Loss

For this three-node deployment:

```text
3 nodes -> healthy, quorum available
2 nodes -> quorum still available
1 node  -> no quorum
```

A leader alone cannot safely commit because `replicateEntry()` counts one local copy but needs two. It can append and persist a local entry, but returns failure, leaves `commitIndex` unchanged, and does not apply the command. A one-node side cannot elect a leader because it cannot gather two votes. Availability is sacrificed for consistency: serving an acknowledged write without a majority could create a result that conflicts with the eventual majority side.

## 36. Network Partition

Consider:

```text
Node 1  X  Node 2 + Node 3
```

If node 1 was the old leader, it stops receiving or completing useful communication and cannot commit new entries by itself. Nodes 2 and 3 form the majority side; after their timers and term changes, one can become leader with two votes and commit there.

The isolated side cannot safely elect or commit because it has only one of three nodes. When the old leader reconnects, a term-4 message causes it to step down from its old term-3 leadership. The new leader's log consistency checks then repair any uncommitted divergent suffix. Quorum intersection prevents both sides from independently committing conflicting decisions.

## 37. Log Catch-up

Suppose:

```text
Leader:   1 2 3 4 5 6
Follower: 1 2 3
```

The leader's `nextIndex` for the follower eventually becomes 4. It sends `prevLogIndex: 3` plus entries 4-6 (at most 64 entries per batch). On success, it sets `matchIndex` to 6 and `nextIndex` to 7. The next request carries `leaderCommit`, allowing the follower to advance its `commitIndex` and apply entries in order.

If the follower is unavailable, the leader returns a replication failure and retains its progress state. When it returns, the same normal replication call catches it up. The test `should catch up a follower after it rejoins` verifies the missing entry, `matchIndex`, and `nextIndex` behavior.

## 38. Conflict Repair

Missing entries and conflicting entries are different:

```text
Missing:     leader 1 2 3 4, follower 1 2
Conflict:    leader 1(term 1) 2(term 3),
	     follower 1(term 1) 2(term 2)
```

For missing entries, the previous prefix matches and the leader appends the suffix. For conflicts, the follower returns `success: false` when `prevLogIndex` or `prevLogTerm` does not match. The leader decreases `nextIndex` by up to 64, retries, and eventually sends a request whose prefix matches. The follower truncates at the first incoming entry with a different term and appends the leader's entries.

This implementation does not use a separate conflict-index/conflict-term response. It uses bounded decrementing and retry. HTTP failures and timeouts are retried up to `replicationMaxRetries` (default 2) with a default 50 ms delay; a failed peer increments `replicationFailures`.

## 39. Convergence

Convergence means that, after communication is restored and a stable leader can reach a majority, all reachable nodes agree on the committed prefix and eventually the same log suffix:

```text
Leader log:    1 2 3 4 5
Follower 1:    1 2 3 4 5
Follower 2:    1 2 3 4 5

StateMachine 1: SET/DELETE commands 1..5 applied
StateMachine 2: SET/DELETE commands 1..5 applied
StateMachine 3: SET/DELETE commands 1..5 applied
```

The log consistency check, suffix replacement, `nextIndex` retry, majority commit, and ordered `lastApplied` loop are the mechanisms that produce this result. The assumption is that nodes can communicate again, a majority is available, commands are deterministic, and persisted files are readable. Uncommitted entries from a former leader may disappear; convergence is about the committed history and the current leader's repaired log.

## 40. Guarantees

### Raft-level guarantees

Within the tested algorithmic model, the implementation provides:

- majority-based leader election;
- one vote per node per term;
- rejection of candidates with older logs;
- stale-term rejection and higher-term step-down;
- log-prefix checking with `prevLogIndex` and `prevLogTerm`;
- majority-based commitment;
- sequential state-machine application; and
- follower catch-up and conflicting suffix repair through `nextIndex`.

The current-term check in `updateCommitIndex()` follows Raft's important commitment rule. With a functioning majority and the protocol assumptions, quorum intersection supports leader uniqueness and state-machine safety.

### Application-level guarantees

The project provides:

- `SET` and `DELETE` commands;
- follower-to-known-leader forwarding for KV requests;
- `503` responses when a majority commit or leader confirmation is unavailable;
- optional request-ID deduplication for repeated `SET` and `DELETE` operations; and
- JSON persistence of Raft metadata and materialized key/value data.

These should not be described as a formal exactly-once or linearizability proof. Request IDs are optional, forwarding depends on `leaderId`, persistence is non-atomic, and `confirmLeadership()` is an implementation-level majority heartbeat check.

## 41. Known Limitations

- The deployed cluster is fixed at three nodes. There is no dynamic membership, joint consensus, or reconfiguration protocol.
- The log grows indefinitely. There is no snapshotting or log compaction.
- `raft-state.json` and `actual-data.json` are written with ordinary `fs.writeFile`; writes are not atomic and there is no write-ahead log or checksum recovery.
- If application data is missing on restart, `StateMachine.initialize()` does not replay the already-applied Raft log to reconstruct it.
- Internal HTTP RPC routes have no request schema validation, TLS, authentication, or peer authorization.
- A stale `leaderId` can remain temporarily because every higher-term transition does not consistently clear it; forwarding can therefore be unavailable or point at an old leader until another valid leader message arrives.
- Receiving same-term `AppendEntries` changes a candidate or leader to follower, but the code does not explicitly stop an existing heartbeat interval in that path. The interval remains, but its callback returns immediately because the state is no longer `LEADER`.
- `confirmLeadership()` sends each follower the leader's full current log index rather than that follower's `nextIndex`. A lagging follower can therefore reject a read confirmation even though a more precise per-follower probe might obtain a majority.
- A write can be replicated to some nodes and still return failure if no majority is reached. The entry remains in the old leader's local log until later leader repair.
- Retrying a failed client write without a `requestId` creates a new logical log entry. Request IDs are tracked in memory and reconstructed only from applied log entries.
- `set()` and `delete()` check request IDs before entering the serialized `writeQueue`, so the implementation does not establish a formal guarantee for every possible concurrent duplicate race.
- The tests mock `fetch`, directly manipulate private fields in places, and do not exercise a real Docker network or crash during a filesystem write. They validate the algorithmic paths but not every production timing, I/O, and network failure mode.
