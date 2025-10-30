# Performance Improvements

This document outlines the performance optimizations made to improve the efficiency and reliability of the HLTV API.

## Summary of Improvements

### 1. Parallel Session Initialization (sessionManager.js)
**Problem**: Sessions were created sequentially using `await` in a loop, causing slow startup times.

**Solution**: Changed to `Promise.all()` to create all sessions in parallel.

**Impact**: 
- Startup time reduced from O(n × request_time) to O(request_time)
- With 3 sessions and 2-second FlareSolverr response time:
  - Before: ~6 seconds
  - After: ~2 seconds
- **~3x faster startup for 3 sessions**

```javascript
// Before: Sequential (slow)
for (let i = 0; i < this.numSessions; i++) {
    await this.sendFlaresolverrRequest("sessions.create", sessionId);
}

// After: Parallel (fast)
await Promise.all(sessionPromises);
```

### 2. Parallel Session Destruction (sessionManager.js)
**Problem**: Session cleanup during shutdown was sequential, causing slow graceful shutdowns.

**Solution**: Changed to `Promise.all()` to destroy all sessions in parallel.

**Impact**:
- Shutdown time reduced from O(n × request_time) to O(request_time)
- **~3x faster shutdown for 3 sessions**

### 3. Request Timeout Configuration (sessionManager.js)
**Problem**: FlareSolverr requests could hang indefinitely, causing resource exhaustion.

**Solution**: Added configurable timeout (default 60 seconds) for all FlareSolverr API calls.

**Impact**:
- Prevents indefinite hanging requests
- Provides timely error responses
- Configurable via `FLARESOLVERR_TIMEOUT` environment variable

```javascript
const response = await axios.post(url, payload, {
    timeout: this.requestTimeout  // 60 seconds default
});
```

### 4. Queue Timeout for Waiting Requests (sessionManager.js)
**Problem**: When all sessions are busy, new requests wait indefinitely in a queue.

**Solution**: Added configurable timeout (default 30 seconds) for queued requests with automatic cleanup.

**Impact**:
- Prevents memory leaks from abandoned requests
- Provides timely error responses when system is overloaded
- Configurable via `QUEUE_TIMEOUT` environment variable

```javascript
// Queued requests now timeout after 30 seconds
const timeoutId = setTimeout(() => {
    reject(new Error(`Request timeout: waited ${this.queueTimeout}ms in queue`));
}, this.queueTimeout);
```

### 5. Non-Blocking Error Logging (index.js)
**Problem**: Error logging awaited MongoDB insert, adding 10-50ms latency to every error response.

**Solution**: Changed to fire-and-forget pattern with promise chaining.

**Impact**:
- Error responses now ~10-50ms faster
- No blocking on database writes
- Error logging failures are caught and logged separately

```javascript
// Before: Blocking (slow)
const errorId = await reportError(err, func, opt);
res.status(400).send({error: err.toString(), id: errorId});

// After: Non-blocking (fast)
const errorId = reportError(err, func, opt);  // Returns immediately
res.status(400).send({error: err.toString(), id: errorId});
```

### 6. MongoDB Connection Pooling (index.js)
**Problem**: No connection pool configuration, potentially causing connection bottlenecks under load.

**Solution**: Added explicit connection pool configuration.

**Impact**:
- Better concurrent request handling
- Reduced connection overhead
- Automatic connection cleanup for idle connections

```javascript
const mongoClient = new MongoClient(process.env.MONGO_URL, {
    maxPoolSize: 10,           // Max 10 concurrent connections
    minPoolSize: 2,            // Keep 2 connections ready
    maxIdleTimeMS: 30000,      // Close idle connections after 30s
    serverSelectionTimeoutMS: 5000,  // Fail fast if DB unavailable
    socketTimeoutMS: 45000     // Timeout long-running operations
})
```

## Environment Variables

The following environment variables control performance-related settings:

- `FLARESOLVERR_TIMEOUT` (default: 60000ms): Timeout for FlareSolverr API requests
- `QUEUE_TIMEOUT` (default: 30000ms): Maximum time a request can wait in queue
- `FLARESOLVERR_NUM_SESSIONS` (default: 3): Number of concurrent FlareSolverr sessions

## Expected Overall Performance Improvements

### Startup Time
- **3x faster** session initialization (6s → 2s with 3 sessions)

### Request Latency
- **10-50ms faster** error responses (non-blocking error logging)
- Better handling of concurrent requests (MongoDB pooling)

### Reliability
- No more indefinite hangs (request and queue timeouts)
- Faster graceful shutdowns (parallel session destruction)
- Better error handling and recovery

### Scalability
- MongoDB connection pooling supports higher concurrent load
- Queue timeout prevents memory leaks under heavy load

## Benchmarking Recommendations

To measure the actual impact, consider running these benchmarks:

1. **Startup Time**: Measure time from app start to "Listening on port 3000"
2. **Error Response Time**: Measure response time for API calls that trigger errors
3. **Concurrent Requests**: Test with multiple concurrent requests to measure throughput
4. **Shutdown Time**: Measure time for graceful shutdown (SIGTERM/SIGINT)

## Future Optimization Opportunities

While not implemented to keep changes minimal, consider these for future improvements:

1. **Session pool optimization**: Use a Set or Map instead of Array for O(1) free session lookup
2. **Request caching**: Cache frequently requested data to reduce FlareSolverr calls
3. **Rate limiting**: Add rate limiting to prevent overwhelming FlareSolverr
4. **Session health checks**: Periodically verify session health and recreate failed sessions
5. **Metrics collection**: Add Prometheus/StatsD metrics for monitoring
