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
      var currentDate = Rally.util.DateTime.fromIsoString(lastIteration.EndDate);
      var numToCreate = totalIterations - iterationOrder.length;
      var iteration = { Name: '', EndDate: ''};
      var iterations = [];
      var i;

      for (i = 0; i < numToCreate; i++) {
        currentDate = Rally.util.DateTime.add(currentDate, 'day', 14);
        iteration.Name = "Future Iteration " + (i + 1);
        iteration.EndDate = Rally.util.DateTime.toIsoString(currentDate);
        iterations.push(me._getIterationKey(iteration));
      }

      return iterations;
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
      console.dir(records);

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

      debugger;
      var categories;
      var series = [];
      var totalCount = 0;

      var toplineCount = 0;
      var topline = [];

      var piToplineCount = 0;
      var piTopline = [];

      var actualBurnup = [];

      var plannedBurnup = [];
      var velocity = parseInt(me.velocity + '', 10);
      var i, ii;


      Ext.Object.each(rawData, function (key, data) {
        iterationData[key] = 0;
      });

      Ext.Object.each(acceptedRawData, function (key, data) {
        totalCount = me._sumArray(data) + totalCount;
        iterationData[key] = totalCount;
      });

      console.log('iterationOrder', iterationOrder);
      Ext.Array.each(iterationOrder, function (iterationName) {
        var key = me._getIterationKey(iterationMap[iterationName]);
        var prev = 0;

        if (plannedBurnup.length > 0) {
          prev = actualBurnup[plannedBurnup.length - 1];

          if (!prev) {
            prev = plannedBurnup[plannedBurnup.length - 1];
          }
        } else {
          prev = 0;
        }

        plannedBurnup.push(prev + velocity);
        if (iterationData[key]) {
          actualBurnup.push(iterationData[key]);
        }
      });

      Ext.Array.each(iterationShim, function (iteration) {
        var prev = 0;

        if (plannedBurnup.length > 0) {
          prev = actualBurnup[plannedBurnup.length - 1];

          if (!prev) {
            prev = plannedBurnup[plannedBurnup.length - 1];
          }
        } else {
          prev = 0;
        }

        plannedBurnup.push(prev + velocity);
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

      Ext.Object.each(rawData, function (key, data) {
        toplineCount = me._sumArray(data) + toplineCount;
      });

      for (i = 1, ii = Ext.Object.getKeys(iterationData).length; i <= ii; i++) {
        topline.push(toplineCount);
      }

      series.push({
        type: 'line',
        name: 'Story Point Topline',
        data: topline
      });

      Ext.Array.each(records, function (record) {
        var value = NaN;
        if (record._type.toLowerCase().indexOf('portfolio') === -1) {
          return;
        }

        if (record.PreliminaryEstimate) {
          value = parseInt(record.PreliminaryEstimate.Value + '', 10);
        }

        console.log('Value for PI', record, value);

        if (!isNaN(value)) {
          piToplineCount = piToplineCount + value;
        }
      });

      for (i = 1, ii = Ext.Object.getKeys(iterationData).length; i <= ii; i++) {
        piTopline.push(piToplineCount);
      }

      series.push({
        type: 'line',
        name: 'Feature Point Topline',
        data: piTopline
      });

      var categories = [];
      Ext.Array.each(iterationOrder, function (iName) {
        categories.push(me._getIterationKey(iterationMap[iName]));
      });

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

    _sumArray: function (arr) {
      var count = 0;

      Ext.Array.each(arr, function (item) {
        var num = parseInt(item.PlanEstimate + '', 10);

        if (!isNaN(num)) {
          count = count + num;
        }
      });

      return count;
    }
});
