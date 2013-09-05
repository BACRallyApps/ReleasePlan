var Ext = window.Ext4 || window.Ext;

Ext.define('CustomApp', {
    extend: 'Rally.app.TimeboxScopedApp',
    componentCls: 'app',

    scopeType: 'release',

    settingsScope: 'project',
    config: {
      defaultSettings: {
        rangeBound: 0
      }
    },

    addContent: function (scope) {
      var me = this;

      Ext.create('Rally.data.WsapiDataStore', {
        autoLoad: true,
        remoteFilter: false,
        model: 'TypeDefinition',
        sorters: [{
          property: 'Ordinal',
          direction: 'Desc'
        }],
        filters: [{
          property: 'Parent.Name',
          operator: '=',
          value: 'Portfolio Item'
        }, {
          property: 'Creatable',
          operator: '=',
          value: 'true'
        }],
        listeners: {
          load: function (store, recs) {
            me.piTypes = {};

            Ext.Array.each(recs, function (type) {
              me.piTypes[type.get('Ordinal') + ''] = type.get('TypePath');
            });

            me.onScopeChange(scope);
          },
          scope: me
        }
      });
    },

    onScopeChange: function (scope) {
      var me = this;
      var query;
      var rangeBound = parseInt('' + me.getSetting('rangeBound'), 0);

      me.removeAll(true);

      if (rangeBound === 0) { // Just the selected release
        query = Rally.data.QueryFilter.and([{
          property: 'Iteration.StartDate',
          operator: '>=',
          value: scope.getRecord().get('ReleaseStartDate')
        }, {
          property: 'Iteration.EndDate',
          operator: '<=',
          value: scope.getRecord().get('ReleaseDate')
        }]);
      } else if (rangeBound < 0) { // All releases up to and including the selected release
      } else if (rangeBound > 0) { // All releases starting with the current release
      } else { // Something went wrong
        console.error('Something went wrong', rangeBound, me.getSetting('rangeBound'));
        return;
      }

      Ext.create('Rally.ui.chart.Chart', {
        storeType: 'Rally.data.WsapiDataStore',
        storeConfig: me._getStoreConfig(query),

        calculatorType: 'ReleasePlanCalculator',

        chartConfig: {
          chart: {
            type: 'column'
          },
          title: {
            text: 'Release Plan'
          },
          subtitle: {
            text: scope.getRecord().get('Name')
          },
          xAxis: {
            title: {
              text: 'Iterations'
            }
          },
          yAxis: {
            min: 0,
            title: {
              text: 'Story Points'
            }
          }
        }
      });
    },

    _getStoreConfig: function (query) {
      var stores = [];

      Ext.Array.each(['HierarchicalRequirement', 'Defect'], function (itm) {
        stores.push({
          autoLoad: true,
          model: 'HierarchicalRequirement',
          filters: query,
          fetch: ['Name', 'Iteration', 'StartDate', 'EndDate', 'PlanEstimate', 'ScheduleState']
        });
      });

      return stores;
    }
});
