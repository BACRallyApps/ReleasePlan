var Ext = window.Ext4 || window.Ext;

Ext.define('CustomApp', {
    extend: 'Rally.app.TimeboxScopedApp',
    componentCls: 'app',

    scopeType: 'release',

    settingsScope: 'project',
    config: {
      defaultSettings: {
        includeBefore: 0,
        includeAfter: 0,
        includePartialSprints: false,
        teamVelocity: 50
      }
    },

    getSettingsFields: function () {
      return [{
        name: 'teamVelocity',
        label: 'Velocity',
        xtype: 'rallynumberfield'
      }, {
        name: 'includePartialSprints',
        label: 'Include Partial Sprints',
        xtype: 'rallycheckboxfield'
      }];
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
      var chart;
      var includePartialIterations = !!me.getSetting('includePartialSprints');
      var beginProperty = includePartialIterations ? 'Iteration.EndDate' : 'Iteration.StartDate';
      var beginOp = includePartialIterations ? '>' : '>=';
      var endProperty = includePartialIterations ? 'Iteration.StartDate' : 'Iteration.EndDate';
      var endOp = includePartialIterations ? '<' : '<=';


      me.removeAll(true);

      query = Rally.data.QueryFilter.and([{
        property: beginProperty,
        operator: beginOp,
        value: me._getStartDate(scope)
      }, {
        property: endProperty,
        operator: endOp,
        value: me._getEndDate(scope)
      }]);

      chart = Ext.create('Rally.ui.chart.Chart', {
        storeType: 'Rally.data.WsapiDataStore',
        storeConfig: me._getStoreConfig(query),

        calculatorType: 'ReleasePlanCalculator',
        calculatorConfig: {
          velocity: me.getSetting('teamVelocity')
        },

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

      me.add(chart);
    },

    _getStartDate: function (scope) {
      return scope.getRecord().raw.ReleaseStartDate;
    },

    _getEndDate: function (scope) {
      return scope.getRecord().raw.ReleaseDate;
    },

    _getStoreConfig: function (query) {
      var me = this;
      var stores = [];

      Ext.Array.each(['HierarchicalRequirement', 'Defect', 'DefectSuite'], function (type) {
        stores.push({
          model: type,
          filters: query,
          fetch: ['Name', 'Iteration', 'StartDate', 'EndDate', 'Release', 'ReleaseStartDate', 'ReleaseDate', 'PlanEstimate', 'ScheduleState', 'AcceptedDate']
        });
      });

      stores.push({
        model: me.piTypes['0'],
        filters: me.getContext().getTimeboxScope().getQueryFilter(),
        fetch: ['Name', 'Release', 'ReleaseStartDate', 'ReleaseDate', 'PreliminaryEstimate', 'Value']
      });

      return stores;
    }
});
