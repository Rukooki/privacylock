// Import the mysql2/promise library for database interactions

const mysql = require('mysql2/promise');

// Log a message to indicate that the script has started
console.log('Script started');

// Define the database configuration
const dbConfig = {
  host: '127.0.0.1',
  port: '3308',
  user: 'wilson',
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
    // Log a message to indicate that the script is connecting to the database
    console.log('Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    console.log('Connected to database');

    // Create the result table if it does not exist
    await createMergedTable(connection);

    // Extract data from each table and write it to the result table
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
    // Drop the table if it exists, then recreate it
    await connection.execute(`DROP TABLE IF EXISTS ${resultTable}`);
    console.log(`Table ${resultTable} dropped successfully`);
  } catch (error) {
    console.error('Error dropping table:', error);
  }

  try {
    // Create the result table
    await connection.execute(`
      CREATE TABLE ${resultTable} (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        Platform VARCHAR(255),
        CookieName VARCHAR(255),
        Category VARCHAR(225),
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
  if (tableName === 'wp_frmt_form_entry' || tableName === 'wp_frmt_form_reports' || tableName === 'wp_frmt_form_views') {
    // Skip these tables
    console.log(`Skipping ${tableName}`);
    return;
  }

  try {
    console.log(`Reading data from ${tableName}...`);
    let query;
    if (tableName === 'wp_frmt_form_entry_meta') {
      // Join wp_frmt_form_entry_meta with wp_frmt_form_entry to get date_created
      query = `
        SELECT fem.entry_id, fem.meta_key, fem.meta_value, fe.date_created 
        FROM wp_frmt_form_entry_meta fem 
        JOIN wp_frmt_form_entry fe ON fem.entry_id = fe.entry_id
      `;
    } else {
      query = `SELECT ${fields.join(', ')} FROM ${tableName}`;
    }

    const [rows] = await connection.execute(query);
    console.log(`Read ${rows.length} rows from ${tableName}`);

    let mappedData;
    if (tableName === 'wp_frmt_form_entry_meta') {
      // Map meta data to corresponding fields
      mappedData = rows.map((row) => {
        const data = {
          Platform: '',
          CookieName: '',
          Category: '',
          Domain: '',
          Description: '',
          DateCreated: row.date_created,
        };

        if (['text-1', 'text-6'].includes(row.meta_key)) {
          data.Platform = row.meta_value;
        } else if (['text-2', 'select-2'].includes(row.meta_key)) {
          data.Category = row.meta_value;
        } else if (['text-3'].includes(row.meta_key)) {
          data.CookieName = row.meta_value;
        } else if (['text-4', 'url-1'].includes(row.meta_key)) {
          data.Domain = row.meta_value;
        } else if (['textarea-1'].includes(row.meta_key)) {
          data.Description = row.meta_value;
        }

        return [
          data.Platform,
          data.CookieName,
          data.Category,
          data.Domain,
          data.Description,
          data.DateCreated,
          data.DateCreated,
        ];
      });
    }

    if (mappedData && mappedData.length > 0) {
      // Insert mapped data into the result table
      const insertQuery = `INSERT INTO ${resultTable} (Platform, CookieName, Category, Domain, Description, DateCreated, DateUpdated) VALUES ?`;
      await connection.query(insertQuery, [mappedData]);
      console.log(`Inserted ${mappedData.length} rows into ${resultTable}`);
    } else {
      console.log(`No data to insert into ${resultTable} from ${tableName}`);
    }
  } catch (error) {
    console.error(`Error extracting and writing data from ${tableName}:`, error);
  }
}

// Call the main function
mergeTables()
  .then(() => {
    console.log('Script finished');
  })
  .catch((error) => {
    console.error('Error:', error);
  });

