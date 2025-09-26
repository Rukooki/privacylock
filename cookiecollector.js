
// Import the mysql2 library
const mysql = require('mysql2');

// Configure Database Credentials
const dbConfig = {
  host: 'pentaprivacy.org',
  user: 'johan',
  password: 'VnYJ7qegT6raBjX!',
  database: 'cookiegocollector_db'
};

// Create a Database Connection
const connection = mysql.createConnection(dbConfig);

// Establish the Connection
connection.connect((error) => {
  if (error) {
    console.error('Error connecting to the database:', error);
    return;
  }
  console.log('Successfully connected to the MySQL database.');

  // Execute a Query to Verify the Connection
  connection.query('SELECT DATABASE() as db_name;', (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
    } else {
      console.log("You're connected to database:", results[0].db_name);

      // Read Data from the Database
      const tableName = 'cookie_detail';
      connection.query(`SELECT * FROM ${tableName} WHERE category = 'functional' ORDER BY RetentionPeriod DESC`, (err, rows) => {
        if (err) {
          console.error('Error reading data:', err);
        } else {
          console.log(`Data read successfully from ${tableName}:`);
          rows.forEach(row => {
            console.log(row);
          });

          // Copy Data to Another Database
          connection.query(`INSERT INTO target_database.target_table SELECT * FROM source_database.source_table`, (err, results) => {
            if (err) {
              console.error('Error copying data:', err);
            } else {
              console.log('Data copied successfully.');
            }

            // Close the Connection
            connection.end((err) => {
              if (err) {
                console.error('Error closing the connection:', err);
                return;
              }
              console.log('MySQL connection is closed.');
            });
          });
        }
      });
    }
  });
});
