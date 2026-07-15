// Import the mysql2/promise module
const mysql = require('mysql2/promise');

console.log('Script started');

// Define the database configuration - XAMPP
const dbConfig = {
  host: '127.0.0.1',
  port: 3306,
  user: 'wilson',
  password: 'Kule117@33!',
  database: 'cookiego_testing_db'
};

// Map meta keys to field names
const metaKeyMap = {
  'text-1': 'platform',
  'text-2': 'category',
  'text-3': 'cookieName',
  'text-4': 'domain',
  'textarea-1': 'description'
};

const cookieMetaKeys = Object.keys(metaKeyMap);
const resultTable = 'cookie_mergedtable';

// Helper to clean domain
function cleanDomain(domain) {
  if (!domain) return '';
  return domain.replace(/^https?:\/\//, '').replace(/^www\./, '').toLowerCase();
}

// Main function
async function mergeTables() {
  let connection;
  try {
    console.log('Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    console.log('Connected to database');

    await createMergedTable(connection);
    await extractAndWriteData(connection);

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

// Create/Recreate result table with UNIQUE key
async function createMergedTable(connection) {
  await connection.execute(`DROP TABLE IF EXISTS ${resultTable}`);
  await connection.execute(`
    CREATE TABLE ${resultTable} (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      Platform VARCHAR(255),
      CookieName VARCHAR(255),
      Category VARCHAR(255),
      Domain VARCHAR(255),
      Description TEXT,
      DateCreated DATETIME,
      DateUpdated DATETIME,
      UNIQUE KEY unique_cookie (CookieName, Domain)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('Merged table created successfully');
}

// Extract only from wp_frmt_form_entry_meta and upsert
async function extractAndWriteData(connection) {
  console.log(`Reading data from wp_frmt_form_entry_meta...`);

  const query = `
    SELECT fem.entry_id, fem.meta_key, fem.meta_value, fe.date_created
    FROM wp_frmt_form_entry_meta fem
    JOIN wp_frmt_form_entry fe ON fem.entry_id = fe.entry_id
    WHERE fem.meta_key IN ('text-1','text-2','text-3','text-4','textarea-1')
  `;

  const [rows] = await connection.execute(query); // <-- FIXED HERE
  console.log(`Read ${rows.length} rows from wp_frmt_form_entry_meta`);

  // Group by entry_id
  const entryMap = {};
  rows.forEach((row) => {
    if (!entryMap[row.entry_id]) {
      entryMap[row.entry_id] = {
        platform: '', cookieName: '', category: '', domain: '', description: '',
        dateCreated: row.date_created, dateUpdated: row.date_created
      };
    }
    const fieldName = metaKeyMap[row.meta_key];
    if (fieldName) entryMap[row.entry_id][fieldName] = row.meta_value;
  });

  // Convert to array and clean data
  const mappedData = Object.values(entryMap)
 .filter(e => e.cookieName && e.cookieName.trim()!== '')
 .map(e => [
     e.platform.trim(),
     e.cookieName.trim(),
     e.category.trim(),
     cleanDomain(e.domain),
     e.description.trim(),
     e.dateCreated,
     e.dateUpdated
   ]);

  if (mappedData.length > 0) {
    const insertQuery = `
      INSERT INTO ${resultTable} (Platform, CookieName, Category, Domain, Description, DateCreated, DateUpdated)
      VALUES?
      ON DUPLICATE KEY UPDATE
        Platform = VALUES(Platform),
        Category = VALUES(Category),
        Domain = VALUES(Domain),
        Description = VALUES(Description),
        DateUpdated = VALUES(DateUpdated)
    `;
    await connection.query(insertQuery, [mappedData]);
    console.log(`Inserted/Updated ${mappedData.length} rows into ${resultTable}`);
  } else {
    console.log(`No data to insert into ${resultTable}`);
  }
}

mergeTables()
.then(() => console.log('Script finished'))
.catch((error) => console.error('Error:', error));