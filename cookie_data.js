// 1. Import the mysql2 library
const mysql = require('mysql2');

// 2. --- IMPORTANT ---
// Replace these placeholder values with your actual database credentials.
const dbConfig = {
  host: 'pentaprivacy.org',      // Or your database host IP/domain
  user: 'johan',
  password: 'VnYJ7qegT6raBjX!',
  database: 'cookiegocollector_db' // The database you want to connect to
};

// 3. Create a connection to the database
const connection = mysql.createConnection(dbConfig);

// 4. Establish the connection
connection.connect(error => {
  if (error) {
    // If there's an error connecting, log it and exit.
    console.error('Error connecting to the database:', error);
    return;
  }
  
  console.log('Successfully connected to the MySQL database.');

  // 5. You can now execute queries.
  // Let's run a simple query to check the connection.
  connection.query('SELECT DATABASE() as db_name;', (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
    } else {
      console.log("You're connected to database:", results[0].db_name);
    }

    // 6. Always close the connection when you're done.
    connection.end(err => {
      if (err) {
        return console.log('Error closing the connection:', err.message);
      }
      console.log('MySQL connection is closed.');
    });
  });
});