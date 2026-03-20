import React from 'react'
import { Plus } from 'lucide-react'
import { useExcelStore } from '../stores/useExcelStore'

const SheetTabs = () => {
  const { tables, activeTableId, loadSheet } = useExcelStore()

  return (
    <div style={{
      height: '36px',
      backgroundColor: '#f3f2f1',
      borderTop: '1px solid #e1dfdd',
      display: 'flex',
      alignItems: 'flex-end',
      paddingLeft: '32px',
      fontSize: '13px',
      gap: '2px',
      overflowX: 'auto',
    }}>
      {tables.map(table => (
        <div
          key={table.id}
          onClick={() => loadSheet(table.id)}
          style={{
            backgroundColor: table.id === activeTableId ? 'white' : 'transparent',
            padding: '6px 20px',
            border: '1px solid #e1dfdd',
            borderBottom: table.id === activeTableId ? 'none' : '1px solid #e1dfdd',
            color: table.id === activeTableId ? '#217346' : '#666',
            fontWeight: table.id === activeTableId ? 600 : 400,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            userSelect: 'none',
          }}
        >
          {table.name}
        </div>
      ))}
      <div style={{ padding: '8px', cursor: 'pointer', color: '#666', display: 'flex', alignItems: 'center' }}>
        <Plus size={16} />
      </div>
    </div>
  )
}

export default SheetTabs
