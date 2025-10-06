// Import the mysql2 library
const mysql = require('mysql2');

// Configure Database Credentials
const dbConfig = {
  host: 'pentaprivacy.org',
  user: 'johan',
  password: 'VnYJ7qegT6raBjX!',
  database: 'cookiegocollector_db' // Main database
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

  // Read data from the main database
  const tableName = 'cookie_detail';
  connection.query(`SELECT * FROM ${tableName} WHERE category = 'functional' ORDER BY RetentionPeriod DESC`, (err, rows) => {
    if (err) {
      console.error('Error reading data:', err);
    } else {
      console.log(`Data read successfully from ${tableName}:`);
      console.log(rows);

      // Create a new table in the main database
      const newTableName = 'cookie_data';
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS ${newTableName} (
          RetentionPeriod ,
          Platform TEXT,
          CookieName TEXT,
          Category TEXT,
          Domain TEXT,
          Description TEXT
        );
      `;
      connection.query(createTableQuery, (error, results) => {
        if (error) {
          console.error('Error creating table:', error);
        } else {
          console.log(`Table ${newTableName} created successfully.`);

          // Write data to the new table
          rows.forEach((row) => {
            const insertQuery = `
              INSERT INTO ${newTableName} (RetentionPeriod, Platform, CookieName, Category, Domain, Description)
              VALUES (?, ?, ?, ?, ?, ?);
            `;
            connection.query(insertQuery, [row.RetentionPeriod, row.Platform, row.CookieName, row.Category, row.Domain, row.Description], (error, results) => {
              if (error) {
                console.error('Error writing data:', error);
              } else {
                console.log('Data written successfully.');
              }
            });
          });
          // Read data from the new table
          const readNewTableQuery = `SELECT * FROM ${newTableName}`;
          connection.query(readNewTableQuery, (error, newTableRows) => {
            if (error) {
              console.error('Error reading data from new table:', error);
            } else {
              console.log(`Data read successfully from ${newTableName}:`);
              console.log(newTableRows);

              // Close the Connection
              connection.end((error) => {
                if (error) {
                  console.error('Error closing the connection:', error);
                  return;
                }
                console.log('MySQL connection is closed.');
              });
            }
          });
        }
      });
    }
  });
});
