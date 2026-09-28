import sqlite3

def check_schema():
    conn = sqlite3.connect('112_simulator.db')
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(scenario_tickets);")
    columns = cursor.fetchall()
    print("scenario_tickets columns:")
    for col in columns:
        print(col[1])

    cursor.execute("PRAGMA table_info(generated_tickets);")
    columns = cursor.fetchall()
    print("generated_tickets columns:")
    for col in columns:
        print(col[1])
    conn.close()

check_schema()
