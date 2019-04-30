const unparametrize_sql_query = require("unparametrize-sql-query");

class PerformanceCounters
{
	constructor()
	{
		this._mapQueryToMetrics = new Map();
		this._nCurrentlyRunningQueries = 0;
		this._nLatencyMilliseconds = null;
	}


	/**
	 * Ignored if nMilliseconds is greater or equal than the already set latency.
	 * 
	 * No matter what kind of database you use, you may periodically do a SELECT 1 to measure latency and remember the smallest value using setLatency().
	 * The latency will be automatically deducted from all query durations.
	 * 
	 * @param {int} nMilliseconds 
	 * @param {boolean} bReset = false
	 */
	setLatency(nMilliseconds, bReset = false)
	{
		if(
			this._nLatencyMilliseconds === null
			|| bReset
		)
		{
			this._nLatencyMilliseconds = nMilliseconds;
		}
		else
		{
			this._nLatencyMilliseconds = Math.min(this._nLatencyMilliseconds, nMilliseconds);
		}
	}


	/**
	 * Increments the running queries count.
	 */
	async onQuery()
	{
		this._nCurrentlyRunningQueries++;
	}


	/**
	 * @param {string} strQuery 
	 * @param {number} nDurationMilliseconds = 0
	 * @param {any} mxResult = undefined
	 */
	async onResult(strQuery, nDurationMilliseconds = 0, mxResult = undefined)
	{
		nDurationMilliseconds = Math.max(0, nDurationMilliseconds - this._nLatencyMilliseconds);

		strQuery = unparametrize_sql_query(strQuery, {bReduceEnumsToOneElement: true});

		this._nCurrentlyRunningQueries = Math.max(0, this._nCurrentlyRunningQueries - 1);

		const objMetrics = this._queryMappings(strQuery);

		objMetrics.successCount += 1;
		objMetrics.successMillisecondsTotal += nDurationMilliseconds;
		objMetrics.successMillisecondsAverage = parseInt(objMetrics.successMillisecondsTotal / objMetrics.successCount);

		if(mxResult && typeof mxResult.length === "number")
		{
			objMetrics.rowsFetched += mxResult.length;
		}
	}


	/**
	 * @param {string} strQuery 
	 * @param {number} nDurationMilliseconds = 0
	 * @param {Error} error = undefined
	 */
	async onError(strQuery, nDurationMilliseconds = 0, error = undefined)
	{
		nDurationMilliseconds = Math.max(0, nDurationMilliseconds - this._nLatencyMilliseconds);

		strQuery = unparametrize_sql_query(strQuery, {bReduceEnumsToOneElement: true});

		this._nCurrentlyRunningQueries = Math.max(0, this._nCurrentlyRunningQueries - 1);
		
		const objMetrics = this._queryMappings(strQuery);

		objMetrics.errorCount += 1;
		objMetrics.errorMillisecondsTotal += nDurationMilliseconds;
		objMetrics.errorMillisecondsAverage = parseInt(objMetrics.errorMillisecondsTotal / objMetrics.errorCount);
	}


	/**
	 * Clears all counters and queries.
	 */
	async clear()
	{
		this._mapQueryToMetrics.clear();
	}

	
	/**
	 * @returns {Map<query:string, metrics:{successCount: number, errorCount: number, successMillisecondsTotal: number, rowsFetched: number, errorMillisecondsTotal: number, successMillisecondsAverage: number, errorMillisecondsAverage: number}>}
	 */
	get metrics()
	{
		return this._mapQueryToMetrics;
	}


	/**
	 * @returns {Object<query:string, metrics:{successCount: number, errorCount: number, successMillisecondsTotal: number, rowsFetched: number, errorMillisecondsTotal: number, successMillisecondsAverage: number, errorMillisecondsAverage: number}>}
	 */
	get metricsAsObject()
	{
		const objMetrics = {};

		for(const strQuery of this._mapQueryToMetrics.keys())
		{
			objMetrics[strQuery] = this._mapQueryToMetrics.get(strQuery);
		}

		return objMetrics;
	}


	/**
	 * @returns {number}
	 */
	get runningQueriesCount()
	{
		return this._nCurrentlyRunningQueries;
	}


	/**
	 * @protected
	 * 
	 * @param {string} strQuery 
	 * 
	 * @returns {undefined}
	 */
	_queryMappings(strQuery)
	{
		let objMetrics = this._mapQueryToMetrics.get(strQuery);

		if(!objMetrics)
		{
			objMetrics = {
				successCount: 0,
				errorCount: 0,

				successMillisecondsTotal: 0,
				errorMillisecondsTotal: 0,

				successMillisecondsAverage: 0,
				errorMillisecondsAverage: 0,

				rowsFetched: 0
			};
			
			this._mapQueryToMetrics.set(strQuery, objMetrics);
		}

		return objMetrics;
	}


	/**
	 * Adds performance counters to promise-mysql by monkey patching the query member function of the Connection class.
	 * 
	 * The base project mysqljs/mysql may at some point have sane support for some lower level query duration metrics (or at least events so we don't have to monkey patch)
	 * (which will still include latency if they won't measure it once with SELECT 1 and then substract it from all durations): 
	 * https://github.com/mysqljs/mysql/pull/1645
	 * 
	 * For this monkey patching of promise-mysql in particular,
	 * keep in mind the duration includes latency, upload and download duration, and also an inordinate amount of non-query related time if the CPU is at 100%.
	 * See the description of .setLatency() for an workaround.
	 * 
	 * @param {MySQL.Connection} connection
	 */
	monkeyPatchPromiseMySQLJSConnection(connection)
	{
		if(!connection.constructor.prototype._bPerformanceCountersPatchApplied)
		{
			const self = this;

			const fnOld = connection.constructor.prototype.query;

			connection.constructor.prototype._bPerformanceCountersPatchApplied = true;
			connection.constructor.prototype.query = async function(query) {
				self.onQuery();

				const nStartUnixTimeMilliseconds = new Date().getTime();

				try
				{
					const mxResult = await fnOld.apply(this, [...arguments]);
					self.onResult(query.sql || query, new Date().getTime() - nStartUnixTimeMilliseconds, mxResult);
					
					return mxResult;
				}
				catch(error)
				{
					self.onError(query.sql || query, new Date().getTime() - nStartUnixTimeMilliseconds, error);
					
					throw error;
				}
			};
		}
	}
};

module.exports = PerformanceCounters;
