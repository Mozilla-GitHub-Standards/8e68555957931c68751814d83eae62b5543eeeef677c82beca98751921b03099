var mysql       = require('mysql');
var async       = require('async');

var connectionOptions = {
  host     : process.env.DB_HOST,
  user     : process.env.DB_USER,
  password : process.env.DB_PASSWORD,
  database : process.env.DB_NAME,
  port     : process.env.DB_PORT
}

if (process.env.DB_SSL) {
  // SSL is used for Amazon RDS, but not necessarily for local dev
  connectionOptions.ssl = process.env.DB_SSL;
}

var pool = mysql.createPool(connectionOptions);



/*
* RESET THE DATABASE
* Allows the DB to be rebuilt from scratch
*/
exports.resetDatabaseYesIreallyWantToDoThis = function resetDatabaseYesIreallyWantToDoThis(callback) {

  pool.getConnection(function connectionAttempted (err, connection) {

    if (err) console.log(err);
    else {
      connection.query('TRUNCATE activities', function queryComplete (err, result) {

        if(err) console.log(err);

        connection.release();
        callback(err);

      });
    }
  });
}



/*
* QUERY
*/
exports.getContributorCounts = function getContributorCounts (date, teamname, callback) {
  counts = {};

  pool.getConnection(function connectionAttempted (err, connection) {

    if (err) {
      console.log(err);
      callback(null, null);
    }
    else {

      var queryDate =  new Date(date);
      queryDate.setHours(0,0,0,0);

      var weekPrior = new Date(queryDate);
      weekPrior.setDate(queryDate.getDate()-7);

      var yearPrior = new Date(queryDate);
      yearPrior.setFullYear(yearPrior.getFullYear() - 1);

      // format these for queryDate
      queryDate = dateToMySQLString(queryDate);
      weekPrior = dateToMySQLString(weekPrior);
      yearPrior = dateToMySQLString(yearPrior);

      // escape prior to queries
      queryDate = connection.escape(queryDate);
      weekPrior = connection.escape(weekPrior);
      yearPrior = connection.escape(yearPrior);
      var mozTeam = connection.escape(teamname);

      async.parallel({
          last_year: function(callback){

              connection.query('SELECT DISTINCT user FROM activities ' +
                        ' WHERE happened_on <= ' + queryDate + ' AND happened_on > ' + yearPrior +
                        ' AND mozilla_team = ' + mozTeam,
                        function queryComplete (err, result) {
                          if(err) console.log(err);
                          callback(null, result)
                        });
          },
          last_week: function(callback){

              connection.query('SELECT DISTINCT user FROM activities ' +
                        ' WHERE happened_on <= ' + queryDate + ' AND happened_on > ' + weekPrior +
                        ' AND mozilla_team = ' + mozTeam,
                        function queryComplete (err, result) {
                          if(err) console.log(err);
                          callback(null, result)
                        });
          },
          last_year_excluding_last_week: function(callback){

              connection.query('SELECT DISTINCT user FROM activities ' +
                        ' WHERE happened_on <= ' + weekPrior + ' AND happened_on > ' + yearPrior +
                        ' AND mozilla_team = ' + mozTeam,
                        function queryComplete (err, result) {
                          if(err) console.log(err);
                          callback(null, result)
                        });
          }
      },
      function(err, results) {
          var namesYear = namesToArray(results.last_year);
          var namesWeek = namesToArray(results.last_week);
          var namesYearExWeek = namesToArray(results.last_year_excluding_last_week);

          counts.total_active_contributors = namesYear.length;
          counts.new_contributors_7_days = countInLastWeekNotPrior(namesWeek, namesYearExWeek);

          connection.release();
          callback(null, counts);
      });
    }
  });
}

function countInLastWeekNotPrior (namesWeek, namesYearExWeek) {
  count = 0;
  for (var i = 0; i < namesWeek.length; i++) {
    if (namesYearExWeek.indexOf(namesWeek[i]) == -1) {
      count++;
    }
  };
  return count;
}

function namesToArray (obj) {
  arr = [];
  for (var i = 0; i < obj.length; i++) {
    arr.push(obj[i].user);
  };
  return arr;
}

function dateToMySQLString (date) {
  var year = date.getFullYear();
  var month = ('0' + (date.getMonth()+1)).slice(-2); // 0 index
  var day = ('0' + date.getDate()).slice(-2);
  return year + '-' + month + '-' + day;
}


/*
* SAVE
*/
exports.saveItem = function saveItem(happened_on, user, team, callback) {

  pool.getConnection(function(err, connection) {

    if (err) {
      console.error(err);
      callback(err);

    } else {

      var entry = {
        happened_on : new Date(happened_on),
        user : encodeURIComponent(user),
        mozilla_team : team
      }

      // Using REPLACE INTO to avoid worrying about duplicate entries
      // There is a unique key set across happened_on, team, user
      connection.query('REPLACE INTO activities SET ?', entry, function(err, result) {
        if(err) {
          console.log("ERROR FOR:", entry);
          console.error(err);
        } else {
          // console.log('saved activity');
          // console.log(activity);
        }
        connection.release();
        callback(null);
      });
    }
  });
};
