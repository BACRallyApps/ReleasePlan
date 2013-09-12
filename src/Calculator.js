var Ext = window.Ext4 || window.Ext;

var __map = function (mapField, records) {
  var map = {};

  Ext.Array.each(records, function (record) {
    if (record.raw) {
      map[record.raw[mapField]] = record.raw;
    } else {
      map[record[mapField]] = record;
    }
  });

  return map;
};

var __sortByDate = function (dateField, outField, map) {
  var arr = Ext.Object.getValues(map);
  var sorted = [];

  console.log('__sortByDate:arr', arr);
  arr.sort(function (a, b) {
    var da = Rally.util.DateTime.fromIsoString(a[dateField]);
    var db = Rally.util.DateTime.fromIsoString(b[dateField]);
    return Rally.util.DateTime.getDifference(da, db, 'day');
  });

  Ext.Array.each(arr, function (rec) {
    sorted.push(rec[outField]);
  });

  return sorted;
};

var __sumArray = function (arr, selectorFn) {
  var count = 0;

  Ext.Array.each(arr, function (item) {
    var num = parseInt(selectorFn(item) + '', 10);

    if (!isNaN(num)) {
      count = count + num;
    }
  });

  return count;
};

Ext.define('ReleasePlanCalculator', {
    extend: 'Rally.data.lookback.calculator.BaseCalculator',

    prepareChartData: function (stores) {
      var snapshots = [];

      Ext.Array.each(stores, function (store) {
        store.each(function (record) {
          snapshots.push(record.raw);
        });
      });

      return this.runCalculation(snapshots);
    },

    _bucketArtifactsIntoIterations: function (records) {
      var me = this;
      var rawData = {};

      Ext.Array.each(records, function (record) {
        if (record._type.toLowerCase().indexOf('portfolio') !== -1) {
          return;
        }

        if (record._type.toLowerCase().indexOf('iteration') !== -1) {
          return;
        }

        var key = me._getBucketKey(record);
        rawData[key] = me._pushRecord(rawData[key], record);
      });

      return rawData;
    },

    _bucketAcceptedArtifactsIntoIterations: function (records) {
      var me = this;
      var acceptedRawData = {};

      Ext.Array.each(records, function (record) {
        if (record._type.toLowerCase().indexOf('portfolio') !== -1) {
          return;
        }

        if (record._type.toLowerCase().indexOf('iteration') !== -1) {
          return;
        }

        var key = me._getBucketKey(record);

        if (record.AcceptedDate) {
          acceptedRawData[key] = me._pushRecord(acceptedRawData[key], record);
        }
      });

      return acceptedRawData;
    },

    _bucketFeaturesIntoReleases: function (records) {
      var bucket = {};
      Ext.Array.each(records, function (record) {
        if (record._type.toLowerCase().indexOf('portfolioitem') === -1) { return; }
        if (!record.Release) { return; }

        bucket[record.Release.Name] = bucket[record.Release.Name] || [];
        bucket[record.Release.Name].push(record);
      });

      return bucket;
    },

    _bucketStoriesIntoReleases: function (records) {
      var bucket = {};
      Ext.Array.each(records, function (record) {
        if (record._type.toLowerCase().indexOf('portfolioitem') !== -1) { return; }
        if (record._type.toLowerCase().indexOf('iteration') !== -1) { return; }

        if (!record.Release) { return; }

        bucket[record.Release.Name] = bucket[record.Release.Name] || [];
        bucket[record.Release.Name].push(record);
      });

      return bucket;
    },

    _computeNumberOfIterations: function (releases) {
      var startRelease = releases[0];
      var endRelease = releases[releases.length - 1];
      var count = 0;
      var max = 100;
      var currentDate = Rally.util.DateTime.fromIsoString(startRelease.raw.ReleaseStartDate);
      var endDate = Rally.util.DateTime.fromIsoString(endRelease.raw.ReleaseDate);

      while (Rally.util.DateTime.getDifference(currentDate, endDate, 'day') < 0) {
        count++;
        currentDate = Rally.util.DateTime.add(currentDate, 'day', 14);
      }

      return count;
    },

    _shimFutureIterations: function (iterationOrder, iterationMap, totalIterations) {
      var me = this;
      var lastIteration = iterationMap[iterationOrder[iterationOrder.length - 1]];
      var currentSDate = Rally.util.DateTime.fromIsoString(lastIteration.StartDate);
      var currentEDate = Rally.util.DateTime.fromIsoString(lastIteration.EndDate);
      var numToCreate = totalIterations - iterationOrder.length;
      var iteration = { Name: '', EndDate: ''};
      var iterations = [];
      var i;

      for (i = 0; i < numToCreate; i++) {
        currentSDate = Rally.util.DateTime.add(currentSDate, 'day', 14);
        currentEDate = Rally.util.DateTime.add(currentEDate, 'day', 14);
        iteration.Name = "Future Iteration " + (i + 1);
        iteration.StartDate = Rally.util.DateTime.toIsoString(currentSDate);
        iteration.EndDate = Rally.util.DateTime.toIsoString(currentEDate);
        iterations.push(iteration.Name);
        iterationMap[iteration.Name] = iteration; // TODO: Remove side effect
      }

      return iterations;
    },

    _isIterationInRelease: function (iteration, release) {
      var iStart = Rally.util.DateTime.fromIsoString(iteration.StartDate);
      var rStart = Rally.util.DateTime.fromIsoString(release.ReleaseStartDate);
      var rEnd = Rally.util.DateTime.fromIsoString(release.ReleaseDate);

      return !!((Rally.util.DateTime.getDifference(iStart, rStart, 'day') >= 0) &&
                (Rally.util.DateTime.getDifference(rEnd, iStart, 'day') >= 0));
    },

    _getReleaseFromIteration: function (iteration, releases) {
      var me = this;
      var ret = null;

      Ext.Array.each(releases, function (release) {
        if (ret) { return; }
        if (me._isIterationInRelease(iteration, release.raw)) {
          ret = release;
        }
      });

      return ret;
    },

    _mapReleasesByName: Ext.bind(__map, this, ['Name'], 0),

    _sortReleasesByStartDate: Ext.bind(__sortByDate, this, ['ReleaseStartDate', 'Name'], 0),

    _mapIterationsByName: Ext.bind(__map, this, ['Name'], 0),

    _sortIterationsByStartDate: Ext.bind(__sortByDate, this, ['StartDate', 'Name'], 0),

    _getIterations: function (records) {
      var iterations = [];

      Ext.Array.each(records, function (record) {
        if (record._type.toLowerCase() !== 'iteration') { return; }

        iterations.push(record);
      });

      return iterations;
    },

    runCalculation: function (records) {
      console.log('Running Calculations');
      //console.dir(records);

      var me = this;
      var releaseMap = me._mapReleasesByName(me.releases);
      var releaseOrder = me._sortReleasesByStartDate(releaseMap);

      me.iterations = me._getIterations(records);

      var iterationMap = me._mapIterationsByName(me.iterations);
      var iterationOrder = me._sortIterationsByStartDate(iterationMap);

      var rawData = me._bucketArtifactsIntoIterations(records);
      var acceptedRawData = me._bucketAcceptedArtifactsIntoIterations(records);
      var iterationData = {};

      me.releases.sort(function (a, b) {
        var da = Rally.util.DateTime.fromIsoString(a.raw.ReleaseStartDate);
        var db = Rally.util.DateTime.fromIsoString(b.raw.ReleaseStartDate);
        return Rally.util.DateTime.getDifference(da, db, 'day');
      });

      var countOfIterations = me._computeNumberOfIterations(me.releases);
      var iterationShim = me._shimFutureIterations(iterationOrder, iterationMap, countOfIterations);
      var allIterations = iterationOrder.concat(iterationShim);

      var releaseData = me._bucketFeaturesIntoReleases(records);
      var releaseStoryData = me._bucketStoriesIntoReleases(records);

      var categories;
      var series = [];
      var totalCount = 0;

      var toplineCount = 0;
      var toplineData = {};
      var topline = [];

      var piToplineCount = 0;
      var piToplineData = {};
      var piTopline = [];

      var actualBurnup = [];

      var plannedBurnup = [];
      var velocity = parseInt(me.velocity + '', 10);
      var i, ii;
      var prev = 0;


      totalCount = 0;
      Ext.Array.each(releaseOrder, function (release) {
        var amount = me._sumArrayByPreliminaryEstimate(releaseData[release]);

        if (amount) {
          totalCount = totalCount + amount;
        }

        piToplineData[release] = totalCount;
      });

      totalCount = 0;
      Ext.Array.each(releaseOrder, function (release) {
        var amount = me._sumArrayByPlanEstimate(releaseStoryData[release]);

        if (amount) {
          totalCount = totalCount + amount;
        }

        toplineData[release] = totalCount;
      });

      Ext.Object.each(rawData, function (key, data) {
        iterationData[key] = 0;
      });

      totalCount = 0;
      Ext.Array.each(allIterations, function (iterationName) {
        var key = me._getIterationKey(iterationMap[iterationName]);
        var amount = me._sumArrayByPlanEstimate(acceptedRawData[key]);

        plannedBurnup.push(prev + velocity);
        piTopline.push(piToplineData[me._getReleaseFromIteration(iterationMap[iterationName], me.releases).raw.Name] || 0);
        topline.push(toplineData[me._getReleaseFromIteration(iterationMap[iterationName], me.releases).raw.Name] || 0);

        if (amount) {
          totalCount = amount + totalCount;
          actualBurnup.push(totalCount);
          prev = totalCount;
        } else {
          prev = prev + velocity;
        }
      });

      series.push({
        type: 'column',
        name: 'Actuals',
        data: actualBurnup
      });

      series.push({
        type: 'column',
        name: 'Planned (' + velocity + ')',
        data: plannedBurnup
      });

      series.push({
        type: 'line',
        name: 'Story Point Topline',
        data: topline
      });

      series.push({
        type: 'line',
        name: 'Feature Point Topline',
        data: piTopline
      });

      categories = [];
      Ext.Array.each(iterationOrder, function (iName) {
        categories.push(me._getIterationKey(iterationMap[iName]));
      });

      debugger;

      return {
        categories: categories.concat(iterationShim),
        series: series
      };
    },

    _getBucketKey: function (record) {
      return this._getIterationKey(record.Iteration);
    },

    _getIterationKey: function (iteration) {
      var rawDate = Rally.util.DateTime.fromIsoString(iteration.EndDate);
      var timezone = Rally.util.DateTime.parseTimezoneOffset(iteration.EndDate);
      var localDate = Rally.util.DateTime.add(rawDate, 'minute', timezone * -1);

      console.log('Date', rawDate, localDate);
      var date = Rally.util.DateTime.formatWithDefault(localDate);
      return iteration.Name + '<br>' + date;
    },

    _pushRecord: function (arr, itm) {
      if (!Ext.isArray(arr)) {
        return [itm];
      } else {
        return arr.concat([itm]);
      }
    },

    _sumArrayByPlanEstimate: Ext.bind(__sumArray, this, [function (item) { return item.PlanEstimate || '0'; }], 1),

    _sumArrayByPreliminaryEstimate: Ext.bind(__sumArray, this, [function (item) {
      if (item.raw) { item = item.raw; }
      if (item.PreliminaryEstimate) {
        return item.PreliminaryEstimate.Value || '0';
      } else {
        return '0';
      }
    }], 1),
});
