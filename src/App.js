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
        name: 'includeBefore',
        label: 'Include Previous Releases',
        xtype: 'rallynumberfield'
      }, {
        name: 'includeAfter',
        label: 'Include Subsequent Releases',
        xtype: 'rallynumberfield'
      },{
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
      var requestedReleases = [];
      var processedReleases = [];
      var numReleaseReqs = 0;
      var preRels = parseInt('' + me.getSetting('includeBefore'), 10) || 0;
      var supRels = parseInt('' + me.getSetting('includeAfter'), 10) || 0;

      var doProcess = function (store, records, success) {
        var rels = [];

        if (records) {
          processedReleases.push(records);
        }

        if (processedReleases.length === numReleaseReqs) {
          rels = rels.concat.apply(rels, processedReleases);
          rels.push(scope.getRecord());

          rels.sort(function (a, b) {
            var da = Rally.util.DateTime.fromIsoString(a.ReleaseStartDate);
            var db = Rally.util.DateTime.fromIsoString(b.ReleaseStartDate);
            return Rally.util.DateTime.getDifference(da, db, 'day');
          });

          me._createChart(rels);
        }
      };

      if (preRels) {
        numReleaseReqs++;
        requestedReleases.push(Ext.create('Rally.data.WsapiDataStore', {
          model: 'Release',
          autoLoad: true,
          limit: preRels,
          sort: 'ReleaseStartDate ASC',
          filters: [{
            property: 'ReleaseStartDate',
            operator: '<',
            value: me._getStartDate(scope.getRecord())
          }],
          listeners: {
            load: doProcess
          }
        }));
      }

      if (supRels) {
        numReleaseReqs++;
        requestedReleases.push(Ext.create('Rally.data.WsapiDataStore', {
          model: 'Release',
          autoLoad: true,
          limit: supRels,
          sort: 'ReleaseStartDate ASC',
          filters: [{
            property: 'ReleaseDate',
            operator: '>',
            value: me._getEndDate(scope.getRecord())
          }],
          listeners: {
            load: doProcess
          }
        }));
      }

      if (!(preRels || supRels)) {
        doProcess();
      }
    },

    _buildQuery: function (releases) {
      var me = this;
      var query;
      var scope = me.getContext().getTimeboxScope();
      var includePartialIterations = !!me.getSetting('includePartialSprints');
      var beginProperty = includePartialIterations ? 'Iteration.EndDate' : 'Iteration.StartDate';
      var beginOp = includePartialIterations ? '>' : '>=';
      var endProperty = includePartialIterations ? 'Iteration.StartDate' : 'Iteration.EndDate';
      var endOp = includePartialIterations ? '<' : '<=';

      query = Rally.data.QueryFilter.and([{
        property: beginProperty,
        operator: beginOp,
        value: me._getStartDate(releases[0])
      }, {
        property: endProperty,
        operator: endOp,
        value: me._getEndDate(releases[releases.length - 1])
      }]);

      return query;
    },

    _buildIterationQuery: function (releases) {
      var me = this;
      var query;
      var scope = me.getContext().getTimeboxScope();
      var includePartialIterations = !!me.getSetting('includePartialSprints');
      var beginProperty = includePartialIterations ? 'EndDate' : 'StartDate';
      var beginOp = includePartialIterations ? '>' : '>=';
      var endProperty = includePartialIterations ? 'StartDate' : 'EndDate';
      var endOp = includePartialIterations ? '<' : '<=';

      query = Rally.data.QueryFilter.and([{
        property: beginProperty,
        operator: beginOp,
        value: me._getStartDate(releases[0])
      }, {
        property: endProperty,
        operator: endOp,
        value: me._getEndDate(releases[releases.length - 1])
      }]);

      return query;
    },

    _createChart: function (releases) {
      var me = this;
      var chart;
      var scope = me.getContext().getTimeboxScope();
      var query = me._buildQuery(releases);
      var iq = me._buildIterationQuery(releases);

      me.removeAll(true);

      chart = Ext.create('Rally.ui.chart.Chart', {
        storeType: 'Rally.data.WsapiDataStore',
        storeConfig: me._getStoreConfig(query, iq),

        calculatorType: 'ReleasePlanCalculator',
        calculatorConfig: {
          releases: releases,
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

    _getStartDate: function (release) {
      return release.raw.ReleaseStartDate;
    },

    _getEndDate: function (release) {
      return release.raw.ReleaseDate;
    },

    _getStoreConfig: function (query, iq) {
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
        fetch: ['Name', 'Release', 'ReleaseStartDate', 'ReleaseDate', 'PreliminaryEstimate', 'Value', 'UserStories', 'PlanEstimate']
      });

      stores.push({
        model: 'Iteration',
        filters: iq,
        fetch: ['Name', 'StartDate', 'EndDate']
      });

      return stores;
    }
});
