var Ext = window.Ext4 || window.Ext;

Ext.define('ReleasePlanCalculator', {
    extend: 'Rally.data.lookback.calculator.BaseCalculator',

    runCalculation: function (records) {
      console.log('Running Calculations');
      console.dir(records);
    }
});
