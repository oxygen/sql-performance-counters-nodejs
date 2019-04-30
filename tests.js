const assert = require("assert");

const PerformanceCounters = require("./index").PerformanceCounters;

process.on(
	"unhandledRejection", 
	(reason, promise) => {
		console.log("[" + process.pid + "] Unhandled Rejection at: Promise", promise, "reason", reason);
		
		process.exit(1);
	}
);

process.on(
	"uncaughtException", 
	(error) => {
		console.log("[" + process.pid + "] Unhandled exception.");
		console.error(error);
		
		process.exit(1);
	}
);


const performanceCounters = new PerformanceCounters();
performanceCounters.setLatency(50);

performanceCounters.onQuery();
performanceCounters.onQuery();
assert.strictEqual(performanceCounters.runningQueriesCount, 2);


performanceCounters.onResult("SELECT 1 FROM table", /*nDurationMilliseconds*/ 100, /*mxResult*/ [1, 2, 3]);
assert.strictEqual(performanceCounters.runningQueriesCount, 1);


performanceCounters.onError("SELECT 1 FROM another_table", /*nDurationMilliseconds*/ 53, /*error*/ new Error("test"));
assert.strictEqual(performanceCounters.runningQueriesCount, 0);


const objControl = { 
	"SELECT ? FROM table": {
		successCount: 1,
		errorCount: 0,
		successMillisecondsTotal: 50,
		errorMillisecondsTotal: 0,
		successMillisecondsAverage: 50,
		errorMillisecondsAverage: 0,
		rowsFetched: 3
	},
	"SELECT ? FROM another_table": {
		successCount: 0,
		errorCount: 1,
		successMillisecondsTotal: 0,
		errorMillisecondsTotal: 3,
		successMillisecondsAverage: 0,
		errorMillisecondsAverage: 3,
		rowsFetched: 0
	}
};

assert.deepStrictEqual(performanceCounters.metricsAsObject, objControl);


console.log("\x1b[32mTests passed.\x1b[0m");
