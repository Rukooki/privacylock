
//importing mysql2 package!
const mysql = require('mysql2/promise');

//Database connection setting!
const dbConfig = {
  host: 'pentaprivacy.org',
  user: 'root',
  password: 'VnYJ7qegT6raBjX!',
  database: 'cookiegocollector_db'
};

//Creating a connection to the datbase
async function connectToDatabase() {
  try {
    const connection = await mysql.createConnection(dbConfig);
    console.log('Connected to the database!');
    return connection;
  } catch (err) {
    console.error('Error connecting to the database:', err);
    throw err;
  }
}
// Read all rows from a table
async function readTableData(connection, tableName) {
  try {
    const [results] = await connection.execute(`SELECT * FROM ${tableName}`);
    console.log(`Data from ${tableName}:`);
    console.log(results);
  } catch (err) {
    console.error(`Error reading data from ${tableName}:`, err);
    throw err;
  }
}
// Main execution
async function main() {
  const connection = await connectToDatabase();
  console.log('Connected')
  const tableName ='cookie_detail';
  await readTableData(connection, tableName); // Pass tableName instead of open_cookie_database
  await connection.end();
  console.log('Database connection closed!');
}

main();
