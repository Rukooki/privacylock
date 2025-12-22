
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
    fields: ['meta_id', 'entry_id', 'meta_key', 'meta_value', 'date_created', 'status']
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

async function extractAndWriteData(connection, tableName, fields) {
  try {
    console.log(`Reading data from ${tableName}...`);
    const [rows] = await connection.execute(`SELECT ${fields.join(', ')} FROM ${tableName}`);
    console.log(`Read ${rows.length} rows from ${tableName}`);

    let mappedData;
    if (tableName === 'wp_frmt_form_entry') {
      mappedData = rows.map((row) => {
        return [
          '', // Retention
          'Forminator', // Platform
          `Form ${row.form_id}`, // CookieName
          'Form Submission', // Category
          '', // Domain
          `Form submission from ${row.date_created}` // Description
        ];
      });
    } else if (tableName === 'wp_frmt_form_entry_meta') {
      mappedData = rows.map((row) => {
        return [
          '', // Retention
          'Forminator', // Platform
          row.meta_key, // CookieName
          'Form Meta', // Category
          '', // Domain
          row.meta_value // Description
        ];
      });
    } else if (tableName === 'wp_frmt_form_reports') {
      mappedData = rows.map((row) => {
        return [
          '', // Retention
          'Forminator', // Platform
          `Report ${row.report_id}`, // CookieName
          'Form Report', // Category
          '', // Domain
          row.report_value // Description
        ];
      });
    } else if (tableName === 'wp_frmt_form_views') {
      mappedData = rows.map((row) => {
        return [
          '', // Retention
          'Forminator', // Platform
          `Form View ${row.view_id}`, // CookieName
          'Form View', // Category
          '', // Domain
          `Form viewed from IP ${row.ip}` // Description
        ];
      });
    }

    if (mappedData.length > 0) {
      const insertQuery = `INSERT INTO ${resultTable} (Retention, Platform, CookieName, Category, Domain, Description) VALUES ?`;
      await connection.query(insertQuery, [mappedData]);
      console.log(`Inserted ${rows.length} rows into ${resultTable}`);
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
