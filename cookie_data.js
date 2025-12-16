const mysql = require('mysql2/promise');
const dbConfig = {
  host: 'pentaprivacy.org',
  user: 'johan',
  password: 'VnYJ7qegT6raBjX!',
  database: 'cookiegoocollector_db'
};

const Tables = [
  { name: 'cookie_detail', newName: 'cookie_data', category: 'functional' },
  // Add more tables as needed
];

async function migrateData() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('Successfully connected to the MySQL database.');

    // Loop to migrate each table
    for (const table of Tables) {
      await migrateTable(connection, table);
    }

    // Loop to read each table into its own list of records
    const records = {};
    for (const table of Tables) {
      records[table.newName] = await readTable(connection, table.newName);
    }

    // Create an output table from different input tables
    await createOutputTable(connection, records);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('MySQL connection is closed.');
    }
  }
}

async function migrateTable(connection, table) {
  try {
    // Read data from the main database
    const [rows] = await connection.execute(`SELECT * FROM ${table.name} WHERE category = '${table.category}' ORDER BY RetentionPeriod DESC`);
    console.log(`Data read successfully from ${table.name}:`);

    // Create a new table in the main database
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ${table.newName} (
        RetentionPeriod TEXT,
        Platform TEXT,
        CookieName TEXT,
        Category TEXT,
        Domain TEXT,
        Description TEXT
      );
    `);
    console.log(`Table ${table.newName} created successfully.`);

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
      INSERT INTO ${table.newName} (RetentionPeriod, Platform, CookieName, Category, Domain, Description)
      VALUES ?
    `, [insertQueries]);
    console.log('Data written successfully.');
  } catch (error) {
    console.error(`Error migrating table ${table.name}:`, error);
  }
}

async function readTable(connection, tableName) {
  try {
    const [rows] = await connection.execute(`SELECT * FROM ${tableName}`);
    console.log(`Data read successfully from ${tableName}:`);
    return rows;
  } catch (error) {
    console.error(`Error reading table ${tableName}:`, error);
  }
}

async function createOutputTable(connection, records) {
  try {
    // Create a new table for the output
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS output_table (
        RetentionPeriod TEXT,
        Platform TEXT,
        CookieName TEXT,
        Category TEXT,
        Domain TEXT,
        Description TEXT
      );
    `);
    console.log('Output table created successfully.');

    // Insert data into the output table
    const outputData = [];
    for (const tableName in records) {
      outputData.push(...records[tableName]);
    }
    const insertQueries = outputData.map((row) => [
      row.RetentionPeriod,
      row.Platform,
      row.CookieName,
      row.Category,
      row.Domain,
      row.Description
    ]);
    await connection.query(`
      INSERT INTO output_table (RetentionPeriod, Platform, CookieName, Category, Domain, Description)
      VALUES ?
    `, [insertQueries]);
    console.log('Data written to output table successfully.');
  } catch (error) {
    console.error('Error creating output table:', error);
  }
}

migrateData();