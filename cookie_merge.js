// Import the mysql2/promise module
const mysql = require('mysql2/promise');

// Log a message to indicate that the script has started
console.log('Script started');

// Define the database configuration - XAMPP DEFAULTS
const dbConfig = {
  host: '127.0.0.1',
  port: 3306, // XAMPP default
  user: 'wilson', // or 'root' if wilson doesn't work yet
  password: 'Kule117@33!',
  database: 'cookiego_testing_db'
};

// Define the tables to extract data from
const tables = [
  { name: 'wp_frmt_form_entry', fields: ['entry_id', 'entry_type', 'draft_id', 'form_id', 'is_spam', 'date_created', 'status'] },
  { name: 'wp_frmt_form_entry_meta', fields: ['meta_id', 'entry_id', 'meta_key', 'meta_value', 'date_created'] },
  { name: 'wp_frmt_form_reports', fields: ['report_id', 'report_value', 'status', 'date_created', 'date_updated'] },
  { name: 'wp_frmt_form_views', fields: ['view_id', 'form_id', 'page_id', 'ip', 'count', 'date_created', 'date_updated'] },
];

// Define the result table
const resultTable = 'cookie_mergedtable';

// Main function to merge tables
async function mergeTables() {
  let connection;
  try {
    console.log('Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    console.log('Connected to database');

    await createMergedTable(connection);

    for (const table of tables) {
      await extractAndWriteData(connection, table.name, table.fields);
    }

    console.log('Data merged successfully');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Connection closed');
    }
  }
}

// Function to create the result table
async function createMergedTable(connection) {
  try {
    await connection.execute(`DROP TABLE IF EXISTS ${resultTable}`);
    console.log(`Table ${resultTable} dropped successfully`);
  } catch (error) {
    console.error('Error dropping table:', error);
  }

  try {
    await connection.execute(`
      CREATE TABLE ${resultTable} (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        Platform VARCHAR(255),
        CookieName VARCHAR(255),
        Category VARCHAR(255), -- fixed 225 to 255
        Domain VARCHAR(255),
        Description TEXT,
        DateCreated DATETIME,
        DateUpdated DATETIME
      );
    `);
    console.log('Merged table created successfully');
  } catch (error) {
    console.error('Error creating merged table:', error);
  }
}

// Function to extract data from a table and write to the result table
async function extractAndWriteData(connection, tableName, fields) {
  if (tableName!== 'wp_frmt_form_entry_meta') {
    console.log(`Skipping ${tableName}`);
    return;
  }

  try {
    console.log(`Reading data from ${tableName}...`);

    const query = `
      SELECT fem.entry_id, fem.meta_key, fem.meta_value, fe.date_created
      FROM wp_frmt_form_entry_meta fem
      JOIN wp_frmt_form_entry fe ON fem.entry_id = fe.entry_id
    `;

    const [rows] = await connection.execute(query);
    console.log(`Read ${rows.length} rows from ${tableName}`);

    // Group by entry_id so we get 1 row per entry
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.entry_id]) {
        grouped[row.entry_id] = {
          Platform: '',
          CookieName: '',
          Category: '',
          Domain: '',
          Description: '',
          DateCreated: row.date_created,
          DateUpdated: row.date_created // use same for now
        };
      }

      if (['text-1', 'text-6'].includes(row.meta_key)) grouped[row.entry_id].Platform = row.meta_value;
      else if (['text-2', 'select-2'].includes(row.meta_key)) grouped[row.entry_id].Category = row.meta_value;
      else if (['text-3'].includes(row.meta_key)) grouped[row.entry_id].CookieName = row.meta_value;
      else if (['text-4', 'url-1'].includes(row.meta_key)) grouped[row.entry_id].Domain = row.meta_value;
      else if (['textarea-1'].includes(row.meta_key)) grouped[row.entry_id].Description = row.meta_value;
    }

    const mappedData = Object.values(grouped).map(d => [
      d.Platform, d.CookieName, d.Category, d.Domain, d.Description, d.DateCreated, d.DateUpdated
    ]);

    if (mappedData.length > 0) {
      const insertQuery = `INSERT INTO ${resultTable} (Platform, CookieName, Category, Domain, Description, DateCreated, DateUpdated) VALUES?`;
      await connection.query(insertQuery, [mappedData]);
      console.log(`Inserted ${mappedData.length} rows into ${resultTable}`);
    }
  } catch (error) {
    console.error(`Error extracting and writing data from ${tableName}:`, error);
  }
}

mergeTables()
 .then(() => console.log('Script finished'))
 .catch((error) => console.error('Error:', error));