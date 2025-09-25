
//Import the mysql2 library

const mysql = require('mysql2');

//Configure Database Credentials

const dbConfig = {
  host: 'pentaprivacy.org', 
  user: 'johan',
  password: 'VnYJ7qegT6raBjX!',
  database: 'cookiegocollector_db' 
};

//Create a Database Connection

const connection = mysql.createConnection(dbConfig);

//Establish the Connection

connection.connect(error => {
  if (error) {

    // If there's an error connecting, log it and exit.

    console.error('Error connecting to the database:', error);
    return;
  }
  console.log('Successfully connected to the MySQL database.');
  
  // 5. Execute a Query to Verify the Connection

  connection.query('SELECT DATABASE() as db_name;', (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
    } else {
      console.log("You're connected to database:", results[0].db_name);
    }

    // 6. Read Data from the Database

const tableName = 'cookie_detail';
connection.query(`SELECT * FROM cookie_detail WHERE \`category\` = 'functional' ORDER BY RetentionPeriod DESC`, (err, results) => {
   if (err) {
    console.error('Error reading data:', err);
  } else {
    console.log(`Data read successfully from ${tableName}:`);
    console.log(results);
  }
  
      // 7. Close the Connection
      
      connection.end(err => {
        if (err) {
          return console.log('Error closing the connection:', err.message);
        }
        console.log('MySQL connection is closed.');
      });
    });
  });
});
