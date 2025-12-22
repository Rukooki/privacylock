const mysql = require('mysql2/promise');

console.log('Script started');

const dbConfig = {
  host: 'localhost',
  user: 'wilson',
  password: 'Kule117@33!',
  database: 'cookiego_testing_db'
};

const tables = [
  {
    name: 'wp_frmt_form_entry',
    fields: ['entry_id', 'entry_type', 'draft_id', 'form_id', 'is_spam', 'date_created', 'status']
  },
  {
    name: 'wp_frmt_form_entry_meta',
    fields: ['meta_id', 'entry_id', 'meta_key', 'meta_value', 'date_created']
  },
  {
    name: 'wp_frmt_form_reports',
    fields: ['report_id', 'report_value', 'status', 'date_created', 'date_updated']
  },
  {
    name: 'wp_frmt_form_views',
    fields: ['view_id', 'form_id', 'page_id', 'ip', 'count', 'date_created', 'date_updated']
  }
];

const resultTable = 'mergedTable';

async function mergeTables() {
  let connection;
  try {
    console.log('Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    console.log('Connected to database');

    // Create a new table to store the merged data
    await createMergedTable(connection);

    // Truncate the table to delete all existing data
    await truncateTable(connection, resultTable);

    // Extract data from WP tables and write to merged table
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

async function createMergedTable(connection) {
  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ${resultTable} (
        Retention TEXT,
        Platform TEXT,
        CookieName TEXT,
        Category TEXT,
        Domain TEXT,
        Description TEXT
      );
    `);
    console.log('Merged table created successfully');
  } catch (error) {
    console.error('Error creating merged table:', error);
  }
}

async function truncateTable(connection, tableName) {
  try {
    await connection.execute(`TRUNCATE TABLE ${tableName}`);
    console.log(`Table ${tableName} truncated successfully`);
  } catch (error) {
    console.error(`Error truncating table ${tableName}:`, error);
  }
}

async function extractAndWriteData(connection, tableName, fields) {
  try {
    console.log(`Reading data from ${tableName}...`);
    const [rows] = await connection.execute(`SELECT ${fields.join(', ')} FROM ${tableName}`);
    console.log(`Read ${rows.length} rows from ${tableName}`);

    let mappedData;
    if (tableName === 'wp_frmt_form_entry_meta') {
      mappedData = rows.map((row) => {
        console.log(`Processing row: ${JSON.stringify(row)}`);
        if (row.meta_key === 'text-1') {
          return [
            '', // Retention
            row.meta_value || '', // Platform
            '', // CookieName
            '', // Category
            '', // Domain
            '' // Description
          ];
        } else if (row.meta_key === 'text-2') {
          return [
            '', // Retention
            '', // Platform
            row.meta_value || '', // CookieName
            '', // Category
            '', // Domain
            '' // Description
          ];
        } else if (row.meta_key === 'text-3') {
          return [
            '', // Retention
            '', // Platform
            '', // CookieName
            row.meta_value || '', // Category
            '', // Domain
            '' // Description
          ];
        } else if (row.meta_key === 'text-4') {
          return [
            '', // Retention
            '', // Platform
            '', // CookieName
            '', // Category
            row.meta_value || '', // Domain
            '' // Description
          ];
        } else if (row.meta_key === 'textarea-1') {
          return [
            '', // Retention
            '', // Platform
            '', // CookieName
            '', // Category
            '', // Domain
            row.meta_value || '' // Description
          ];
        }
        return null;
      }).filter(Boolean);
    } else {
      mappedData = [];
    }

    console.log(`Mapped data: ${JSON.stringify(mappedData)}`);

    if (mappedData && mappedData.length > 0) {
      const insertQuery = `INSERT INTO ${resultTable} (Retention, Platform, CookieName, Category, Domain, Description) VALUES ?`;
      await connection.query(insertQuery, [mappedData]);
      console.log(`Inserted ${mappedData.length} rows into ${resultTable}`);
    } else {
      console.log(`No data to insert into ${resultTable} from ${tableName}`);
    }
  } catch (error) {
    console.error(`Error extracting and writing data from ${tableName}:`, error);
  }
}

mergeTables()
  .then(() => {
    console.log('Script finished');
  })
  .catch((error) => {
    console.error('Error:', error);
  });
