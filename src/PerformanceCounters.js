const unparametrize_sql_query = require("unparametrize-sql-query");
const assert = require("assert");

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
	 * @param {number} nFetchedRows = 0
	 * @param {number} nAffectedRows = 0
	 * @param {number} nChangedRows = 0
	 */
	async onResult(strQuery, nDurationMilliseconds = 0, nFetchedRows = 0, nAffectedRows = 0, nChangedRows = 0)
	{
		nDurationMilliseconds = Math.max(0, nDurationMilliseconds - this._nLatencyMilliseconds);

		strQuery = unparametrize_sql_query(strQuery, {bReduceEnumsToOneElement: true});

		this._nCurrentlyRunningQueries = Math.max(0, this._nCurrentlyRunningQueries - 1);

		const objMetrics = this._queryMappings(strQuery);

		objMetrics.successCount += 1;
		objMetrics.successMillisecondsTotal += nDurationMilliseconds;
		objMetrics.successMillisecondsAverage = parseInt(objMetrics.successMillisecondsTotal / objMetrics.successCount);

		objMetrics.fetchedRows += parseInt(nFetchedRows);
		objMetrics.affectedRows += parseInt(nAffectedRows);
		objMetrics.changedRows += parseInt(nChangedRows);
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
	clear()
	{
		this._mapQueryToMetrics.clear();
	}

	
	/**
	 * @returns {Map<query:string, metrics:{successCount: number, errorCount: number, successMillisecondsTotal: number, fetchedRows: number, affectedRows: number, changedRows: 0, errorMillisecondsTotal: number, successMillisecondsAverage: number, errorMillisecondsAverage: number}>}
	 */
	get metrics()
	{
		return this._mapQueryToMetrics;
	}


	/**
	 * @returns {Object<query:string, metrics:{successCount: number, errorCount: number, successMillisecondsTotal: number, fetchedRows: number, affectedRows: number, changedRows: 0, errorMillisecondsTotal: number, successMillisecondsAverage: number, errorMillisecondsAverage: number}>}
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

				fetchedRows: 0,
				affectedRows: 0,
				changedRows: 0
			};
			
			this._mapQueryToMetrics.set(strQuery, objMetrics);
		}

		return objMetrics;
	}


	/**
	 * Adds performance counters to promise-mysql by listening on a Connection class instance.
	 * 
	 * Keep in mind the duration includes latency, upload and download duration, and also an inordinate amount of non-query related time if the CPU is at 100%.
	 * See the description of .setLatency() for an workaround.
	 * 
	 * @param {MySQL.Connection|MySQL.PoolConnection} connection
	 */
	onMySQLPromiseConnection(connection)
	{
		assert(connection && connection.constructor && ["Connection", "PoolConnection"].includes(connection.constructor.name));
		
		connection.on("enqueue", (sequence) => {
			if(sequence.constructor.name === "Query")
			{
				this.onQuery();

				const nStartUnixTimeMilliseconds = new Date().getTime();
				
				let nDurationMilliseconds = 0;
				let error = null;
				
				let bHandled = false;
				
				const fnSaveDuration = () => {
					if(!nDurationMilliseconds)
					{
						nDurationMilliseconds = new Date().getTime() - nStartUnixTimeMilliseconds;
					}
				};
				
				
				const fnOnError = (_error) => {
					fnSaveDuration();
					error = _error;
				};
				
				const fnOnEnd = () => {
					if(bHandled)
					{
						return;
					}
					
					bHandled = true;
					
					sequence.removeListener("fields", fnSaveDuration);
					sequence.removeListener("error", fnOnError);
					sequence.removeListener("error", fnOnEnd);
					sequence.removeListener("end", fnOnEnd);
					
					
					if(error)
					{
						fnSaveDuration();
						this.onError(sequence.sql, nDurationMilliseconds, error);
					}
					else
					{
						let nAffectedRows = 0;
						let nChangedRows = 0;
						let nFetchedRows = 0;
						if(sequence._results && sequence._results[0])
						{
							if(sequence._results[0].length)
							{
								nFetchedRows = sequence._results[0].length;
							}
							else if(sequence._results[0].constructor && sequence._results[0].constructor.name === "OkPacket")
							{
								nAffectedRows = sequence._results[0].affectedRows;
								nChangedRows = sequence._results[0].changedRows;
							}
						}
						
						fnSaveDuration();
						this.onResult(sequence.sql, nDurationMilliseconds, nFetchedRows, nAffectedRows, nChangedRows);
					}
				};
				
			
				sequence.on("fields", fnSaveDuration);
				sequence.on("error", fnSaveDuration);
				sequence.on("error", fnOnEnd);
				sequence.on("error", fnOnError);
				sequence.on("end", fnOnEnd);
			}		
		});
	}
};

module.exports = PerformanceCounters;
