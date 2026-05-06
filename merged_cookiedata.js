
/*const mysql = require('mysql2/promise');

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

const resultTable = 'cookie_mergedtable';

const metaKeyMap = {
  'text-1': 'platform',
  'text-2': 'cookieName',
  'text-3': 'category',
  'text-4': 'domain',
  'textarea-1': 'description'
};

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
    await connection.execute(`DROP TABLE IF EXISTS ${resultTable}`);
    await connection.execute(`
      CREATE TABLE ${resultTable} (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        Platform TEXT,
        CookieName TEXT,
        Category TEXT,
        Domain TEXT,
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

async function extractAndWriteData(connection, tableName, fields) {
  try {
    console.log(`Reading data from ${tableName}...`);
    let query;
    if (tableName === 'wp_frmt_form_entry_meta') {
      query = `
        SELECT fem.meta_id, fem.entry_id, fem.meta_key, fem.meta_value, fe.date_created
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
      const entryMap = {};
      rows.forEach((row) => {
        if (!entryMap[row.entry_id]) {
          entryMap[row.entry_id] = {
            platform: '',
            cookieName: '',
            category: '',
            domain: '',
            description: '',
            dateCreated: row.date_created,
            dateUpdated: row.date_created,
          };
        }
        const fieldName = metaKeyMap[row.meta_key];
        if (fieldName) {
          entryMap[row.entry_id][fieldName] = row.meta_value;
        }
      });

      mappedData = Object.values(entryMap).map((entry) => {
        return [
          entry.platform, // Platform
          entry.cookieName, // CookieName
          entry.category, // Category
          entry.domain, // Domain
          entry.description, // Description
          entry.dateCreated, // DateCreated
          entry.dateUpdated, // DateUpdated
        ];
      });
    } else {
      mappedData = [];
    }

    console.log(`Mapped data: ${JSON.stringify(mappedData)}`);

    if (mappedData && mappedData.length > 0) {
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

mergeTables()
  .then(() => {
    console.log('Script finished');
  })
  .catch((error) => {
    console.error('Error:', error);
  });
*/

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

const resultTable = 'cookies_data';

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
    await connection.execute(`DROP TABLE IF EXISTS ${resultTable}`);
    await connection.execute(`
      CREATE TABLE ${resultTable} (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        FormID INT,
        FieldName TEXT,
        FieldValue TEXT,
        DateCreated DATETIME
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
    let query;
    if (tableName === 'wp_frmt_form_entry_meta') {
      query = `
        SELECT fem.meta_id, fem.entry_id, fem.meta_key, fem.meta_value, fe.date_created, fe.form_id
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
      mappedData = rows.map((row) => {
        return [
          row.form_id, // FormID
          row.meta_key, // FieldName
          row.meta_value, // FieldValue
          row.date_created, // DateCreated
        ];
      });
    } else {
      mappedData = [];
    }

    console.log(`Mapped data: ${JSON.stringify(mappedData)}`);

    if (mappedData && mappedData.length > 0) {
      const insertQuery = `INSERT INTO ${resultTable} (FormID, FieldName, FieldValue, DateCreated) VALUES ?`;
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