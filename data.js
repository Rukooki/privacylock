const mysql = require('mysql2/promise');

const dbConfig = {
  host: 'pentaprivacy.org',
  user: 'johan',
  password: 'VnYJ7qegT6raBjX!',
  database: 'cookiegocollector_db'
};

async function migrateData() {
  try {
    const connection = await mysql.createConnection(dbConfig);
    console.log('Successfully connected to the MySQL database.');

    const tableName = 'cookie_detail';
    const newTableName = 'cookie_data';

    // Read data from the main database
    const [rows] = await connection.execute(`SELECT * FROM ${tableName} WHERE category = 'functional' ORDER BY RetentionPeriod DESC`);
    console.log(`Data read successfully from ${tableName}:`);

    // Create a new table in the main database
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ${newTableName} (
        RetentionPeriod TEXT,
        Platform TEXT,
        CookieName TEXT,
        Category TEXT,
        Domain TEXT,
        Description TEXT
      );
    `);
    console.log(`Table ${newTableName} created successfully.`);

    // Write data to the new table
    const insertQueries = rows.map((row) => [
      row.RetentionPeriod,
      row.Platform,
      row.CookieName,
      row.Category,
      row.Domain,
      row.Description
    ]);
    await connection.query(`
      INSERT INTO ${newTableName} (RetentionPeriod, Platform, CookieName, Category, Domain, Description)
      VALUES ?
    `, [insertQueries]);
    console.log('Data written successfully.');

    // Read data from the new table
    const [newTableRows] = await connection.execute(`SELECT * FROM ${newTableName}`);
    console.log(`Data read successfully from ${newTableName}:`);
    console.log(newTableRows);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
    console.log('MySQL connection is closed.');
  }
}

migrateData();

