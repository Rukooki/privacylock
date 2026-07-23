const mysql = require('mysql2/promise');

console.log('Script started');

const dbConfig = {
  host: '127.0.0.1',
  port: 3306,
  user: 'wilson',
  password: 'Kule117@33!',
  database: 'cookiego_testing_db'
};

// Map Formidable keys to our columns
const metaKeyMap = {
  'text-1': 'Platform',
  'text-2': 'Category',
  'text-3': 'CookieName',
  'text-4': 'Domain',
  'textarea-1': 'Description'
};

const resultTable = 'cookies_merging';

function cleanDomain(domain) {
  if (!domain) return '';
  return domain.replace(/^https?:\/\//, '').replace(/^www\./, '').toLowerCase();
}

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

// Table with only the 5 columns you need
async function createMergedTable(connection) {
  await connection.execute(`DROP TABLE IF EXISTS ${resultTable}`);
  await connection.execute(`
    CREATE TABLE ${resultTable} (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      EntryID INT UNIQUE,
      Platform VARCHAR(255),
      Category VARCHAR(255),
      CookieName VARCHAR(255),
      Domain VARCHAR(255),
      Description TEXT,
      DateCreated DATETIME,
      DateUpdated DATETIME
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('Merged table `cookies_merging` created successfully');
}

async function extractAndWriteData(connection) {
  console.log(`Reading data from wp_frmt_form_entry_meta...`);

  const query = `
    SELECT fem.entry_id, fem.meta_key, fem.meta_value, fe.date_created
    FROM wp_frmt_form_entry_meta fem
    LEFT JOIN wp_frmt_form_entry fe ON fem.entry_id = fe.entry_id
  `;

  const result = await connection.execute(query);
  const rows = result[0];
  console.log(`Read ${rows.length} rows from wp_frmt_form_entry_meta`);

  // Group all meta_keys by entry_id
  const entryMap = {};
  rows.forEach((row) => {
    if (!entryMap[row.entry_id]) {
      entryMap[row.entry_id] = {
        EntryID: row.entry_id,
        Platform: '',
        Category: '',
        CookieName: '',
        Domain: '',
        Description: '',
        DateCreated: row.date_created || new Date(),
        DateUpdated: row.date_created || new Date()
      };
    }

    const colName = metaKeyMap[row.meta_key];
    if (colName) {
      let value = row.meta_value || '';
      if (row.meta_key === 'text-4') value = cleanDomain(value); // clean domain
      entryMap[row.entry_id][colName] = value;
    }
  });

  const mappedData = Object.values(entryMap).map(e => [
      e.EntryID,
      e.Platform.trim(),
      e.Category.trim(),
      e.CookieName.trim(),
      e.Domain.trim(),
      e.Description.trim(),
      e.DateCreated,
      e.DateUpdated
    ]);

  console.log(`Grouped into ${mappedData.length} cookie entries`);

  if (mappedData.length > 0) {
    const insertQuery = `
      INSERT INTO ${resultTable}
      (EntryID, Platform, Category, CookieName, Domain, Description, DateCreated, DateUpdated)
      VALUES?
      ON DUPLICATE KEY UPDATE
        Platform = VALUES(Platform),
        Category = VALUES(Category),
        CookieName = VALUES(CookieName),
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