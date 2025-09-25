

// 7. Write Data to another Database
        const anotherTableName = 'another_table';
        results.forEach(row => {
          const insertQuery = `INSERT INTO ${anotherTableName} SET ?`;
          anotherConnection.query(insertQuery, row, (err, results) => {
            if (err) {
              console.error('Error writing data to another database:', err);
            } else {
              console.log(`Data written successfully to ${anotherTableName}`);
            }
          });
        });
      
