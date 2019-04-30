# SQL Performance Counters

[![Version npm](https://img.shields.io/npm/v/sql-performance-counters.svg)](https://www.npmjs.com/package/sql-performance-counters)

[![Linux build](https://travis-ci.org/oxygen/sql-performance-counters-nodejs.svg?branch=master)](https://travis-ci.org/oxygen/sql-performance-counters-nodejs)

Performance metrics of database queries per query.

String literals and number constants are removed from queries using [unparametrize-sql-query](https://github.com/oxygen/unparametrize-sql-query) before adding an entry in the database.

The database is accessible as a Map on the `PerformanceCounters.metrics` property or as an object on `PerformanceCounters.metricsAsObject` and it looks something like this:

```JavaScript
{ 
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
}
```

## Installation:

```shell
npm i sql-performance-counters
```

## Usage
See [tests.js](./tests.js) and [PerformanceCounters.js](./src/PerformanceCounters.js) for usage.


You should use `PerformanceCounters.js` as a global singleton. For example, create a file named `PerformanceCountersSingleton.js` with these contents:

```JavaScript
const PerformanceCounters = require("sql-performance-counters").PerformanceCounters;

module.exports = new PerformanceCounters();
```

Then throughout your application you may acces the same instance to get the metrics or record activity:


```JavaScript
const performanceCounters = require("./PerformanceCountersSingleton");


performanceCounters.setLatency(50);

performanceCounters.onQuery();
console.log(performanceCounters.runningQueriesCount);

performanceCounters.onQuery();
console.log(performanceCounters.runningQueriesCount);


performanceCounters.onResult("SELECT 1 FROM table", /*nDurationMilliseconds*/ 100, /*mxResult*/ [1, 2, 3]);
console.log(performanceCounters.runningQueriesCount);

performanceCounters.onError("SELECT 1 FROM another_table", /*nDurationMilliseconds*/ 53, /*error*/ new Error("test"));
console.log(performanceCounters.runningQueriesCount);


const objMetrics = performanceCounters.metricsAsObject;
console.log(objMetrics);


performanceCounters.clear();
```


## Usage with promise-mysql 
If using MySQL and using [promise-mysql](https://www.npmjs.com/package/promise-mysql), you may use conveniently use the `PerformanceCounters.monkeyPatchPromiseMySQLJSConnection()` function to get started rapidly.


```JavaScript
const MySQL = require("promise-mysql");

/* [...] */
const pool = MySQL.createPool(mysqljsConfigObject);

pool.on(
	"connection", 
	(connection) => {
		PerformanceCounters.monkeyPatchPromiseMySQLJSConnection(connection);

		/* [...] */
	}
);

(async() => {
	const connection = await MySQL.createConnection(mysqljsConfigObject);

	PerformanceCounters.monkeyPatchPromiseMySQLJSConnection(connection);

	/* [...] */
})();
```

See [PerformanceCounters.js](./src/PerformanceCounters.js) for how `PerformanceCounters.monkeyPatchPromiseMySQLJSConnection()` works.
