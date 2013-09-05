var Ext = window.Ext4 || window.Ext;

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

    runCalculation: function (records) {
      console.log('Running Calculations');
      console.dir(records);

      var me = this;
      var rawData = {};
      var acceptedRawData = {};
      var iterationData = {};
      var categories;
      var series = [];
      var totalCount = 0;
      var toplineCount = 0;
      var plannedBurnup = [];
      var topline = [];
      var velocity = parseInt(me.velocity + '', 10);
      var i, ii;

      Ext.Array.each(records, function (record) {
        var key = me._getBucketKey(record);
        rawData[key] = me._pushRecord(rawData[key], record);

        if (record.AcceptedDate) {
          acceptedRawData[key] = me._pushRecord(acceptedRawData[key], record);
        }
      });

      Ext.Object.each(rawData, function (key, data) {
        iterationData[key] = 0;
      });

      Ext.Object.each(acceptedRawData, function (key, data) {
        totalCount = me._sumArray(data) + totalCount;
        iterationData[key] = totalCount;
      });

      series.push({
        type: 'column',
        name: 'Actuals',
        data: Ext.Object.getValues(iterationData)
      });

      for (i = 1, ii = Ext.Object.getKeys(iterationData).length; i <= ii; i++) {
        plannedBurnup.push(i * velocity);
      }

      series.push({
        type: 'column',
        name: 'Planned',
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
        name: 'topline',
        data: topline
      });

      return {
        categories: Ext.Object.getKeys(iterationData),
        series: series
      };
    },

    _getBucketKey: function (record) {
      return record.Iteration.Name;
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
