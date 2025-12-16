const mysql = require('mysql2/promise');
const dbConfig = {
  host: 'pentaprivacy.org',
  user: 'johan',
  password: 'VnYJ7qegT6raBjX!',
  database: 'cookiegocollector_db'
};

const tables = [
  { name: 'cookie_detail', newName: 'cookie_data', category: 'functional' },
  // Add more tables as needed
];

async function migrateData() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('Connected to the database');

    for (const table of tables) {
      await migrateTable(connection, table);
    }

    // Loop to read each table into its own list of records
    const records = {};
    for (const table of tables) {
      records[table.newName] = await readTable(connection, table.newName);
    }

    await createOutputTable(connection, records);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Connection closed');
    }
  }
}

async function migrateTable(connection, table) {
  try {
    const [rows] = await connection.execute(`SELECT * FROM ${table.name} WHERE category = ? ORDER BY RetentionPeriod DESC`, [table.category]);
    console.log(`Read ${rows.length} rows from ${table.name}`);

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
    const insertQuery = `INSERT INTO ${table.newName} (RetentionPeriod, Platform, CookieName, Category, Domain, Description) VALUES ?`;
    const values = rows.map((row) => [
      row.RetentionPeriod,
      row.Platform,
      row.CookieName,
      row.Category,
      row.Domain,
      row.Description
    ]);

    await connection.query(insertQuery, [values]);
    console.log(`Inserted ${rows.length} rows into ${table.newName}`);
  } catch (error) {
    console.error(`Error migrating table ${table.name}:`, error);
  }
}

async function readTable(connection, tableName) {
  try {
    const [rows] = await connection.execute(`SELECT * FROM ${tableName}`);
    console.log(`Read ${rows.length} rows from ${tableName}`);
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

    const insertQuery = `INSERT INTO output_table (RetentionPeriod, Platform, CookieName, Category, Domain, Description) VALUES ?`;
    const values = outputData.map((row) => [
      row.RetentionPeriod,
      row.Platform,
      row.CookieName,
      row.Category,
      row.Domain,
      row.Description
    ]);

    await connection.query(insertQuery, [values]);
    console.log(`Inserted ${outputData.length} rows into output_table`);
  } catch (error) {
    console.error('Error creating output table:', error);
  }
}

migrateData();
