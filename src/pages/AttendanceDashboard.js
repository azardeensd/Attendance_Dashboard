import React, { useState, useEffect } from 'react';
import supabase from '../services/auth';
import './AttendanceDashboard.css';
import * as XLSX from 'xlsx'; // You'll need to install this package
import { SpeedInsights } from "@vercel/speed-insights/react";

const AttendanceDashboard = () => {
    const [attendanceData, setAttendanceData] = useState({
        daily: [],
        weekly: [],
        departmentData: [],
        summary: {
            totalHeadCount: 0,
            totalPresent: 0,
            totalAbsent: 0,
            attendancePercentage: 0
        }
    });
    const [filter, setFilter] = useState('daily');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [exportLoading, setExportLoading] = useState(false);

    // All departments
    const allDepartments = [
        'MARKETING','R&D','I.S','MMD','MESD','QUALITY','FINANCE','MMD-STA','TPM','HR','PROG.MGMT','BH OFFICE',
'TQM','HSE','STRATEGY'
    ];

    // Update current time every second
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Fetch attendance data
    useEffect(() => {
        fetchAttendanceData();
    }, [filter, selectedDate]);

    const fetchAttendanceData = async () => {
        setLoading(true);
        try {
            if (filter === 'daily') {
                await fetchDailyAttendance();
            } else {
                await fetchWeeklyAttendance();
            }
            await fetchDepartmentData();
        } catch (error) {
            console.error('Error fetching attendance data:', error);
            setAttendanceData(prev => ({
                ...prev,
                departmentData: []
            }));
        } finally {
            setLoading(false);
        }
    };

    const fetchDailyAttendance = async () => {
        try {
            // Get total employees count
            const { count: totalHeadCount, error: countError } = await supabase
                .from('employees')
                .select('*', { count: 'exact' });

            if (countError) throw countError;

            // Get today's attendance
            const { data: dailyData, error: dailyError } = await supabase
                .from('attendance')
                .select('*')
                .eq('check_in_date', selectedDate)
                .order('check_in_time', { ascending: false });

            if (dailyError) throw dailyError;

            const totalPresent = dailyData?.length || 0;
            const totalAbsent = (totalHeadCount || 0) - totalPresent;
            const attendancePercentage = totalHeadCount > 0 ? 
                Math.round((totalPresent / totalHeadCount) * 100) : 0;

            setAttendanceData(prev => ({
                ...prev,
                daily: dailyData || [],
                summary: {
                    totalHeadCount: totalHeadCount || 0,
                    totalPresent,
                    totalAbsent,
                    attendancePercentage
                }
            }));
        } catch (error) {
            console.error('Error in fetchDailyAttendance:', error);
            throw error;
        }
    };

    const fetchWeeklyAttendance = async () => {
        try {
            const selectedDateObj = new Date(selectedDate);
            
            // Calculate start of week (Monday)
            const startOfWeek = new Date(selectedDateObj);
            startOfWeek.setDate(selectedDateObj.getDate() - selectedDateObj.getDay() + 1);
            startOfWeek.setHours(0, 0, 0, 0);
            
            // Calculate end of week (Sunday)
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            endOfWeek.setHours(23, 59, 59, 999);

            // Get total employees count
            const { count: totalHeadCount, error: countError } = await supabase
                .from('employees')
                .select('*', { count: 'exact' });

            if (countError) throw countError;

            // Get weekly attendance
            const { data: weeklyData, error: weeklyError } = await supabase
                .from('attendance')
                .select('*')
                .gte('check_in_date', startOfWeek.toISOString().split('T')[0])
                .lte('check_in_date', endOfWeek.toISOString().split('T')[0]);

            if (weeklyError) throw weeklyError;

            // Get today's attendance for summary
            const { data: dailyData, error: dailyError } = await supabase
                .from('attendance')
                .select('*')
                .eq('check_in_date', selectedDate)
                .order('check_in_time', { ascending: false });

            if (dailyError) throw dailyError;

            const totalPresent = dailyData?.length || 0;
            const totalAbsent = (totalHeadCount || 0) - totalPresent;
            const attendancePercentage = totalHeadCount > 0 ? 
                Math.round((totalPresent / totalHeadCount) * 100) : 0;

            setAttendanceData(prev => ({
                ...prev,
                daily: dailyData || [],
                weekly: weeklyData || [],
                summary: {
                    totalHeadCount: totalHeadCount || 0,
                    totalPresent,
                    totalAbsent,
                    attendancePercentage
                }
            }));
        } catch (error) {
            console.error('Error in fetchWeeklyAttendance:', error);
            throw error;
        }
    };

    const fetchDepartmentData = async () => {
        try {
            let departmentStats = [];
            
            if (filter === 'daily') {
                // For daily view, get attendance by department for selected date
                const { data: deptData, error } = await supabase
                    .from('attendance')
                    .select('department_name')
                    .eq('check_in_date', selectedDate);

                if (error) throw error;

                // Count presents by department
                const presentCounts = {};
                allDepartments.forEach(dept => {
                    presentCounts[dept] = 0;
                });

                deptData?.forEach(record => {
                    if (record.department_name && presentCounts[record.department_name] !== undefined) {
                        presentCounts[record.department_name]++;
                    }
                });

                // Get total employees per department
                const { data: employees, error: empError } = await supabase
                    .from('employees')
                    .select('department_name');

                if (empError) throw empError;

                const totalCounts = {};
                allDepartments.forEach(dept => {
                    totalCounts[dept] = 0;
                });

                employees?.forEach(emp => {
                    if (emp.department && totalCounts[emp.department] !== undefined) {
                        totalCounts[emp.department]++;
                    }
                });

                // Prepare department data
                departmentStats = allDepartments.map(dept => ({
                    department: dept,
                    present: presentCounts[dept] || 0,
                    total: totalCounts[dept] || 0,
                    absent: (totalCounts[dept] || 0) - (presentCounts[dept] || 0)
                }));

            } else {
                // For weekly view, get attendance by department for the week
                const selectedDateObj = new Date(selectedDate);
                const startOfWeek = new Date(selectedDateObj);
                startOfWeek.setDate(selectedDateObj.getDate() - selectedDateObj.getDay() + 1);
                startOfWeek.setHours(0, 0, 0, 0);
                
                const endOfWeek = new Date(startOfWeek);
                endOfWeek.setDate(startOfWeek.getDate() + 6);
                endOfWeek.setHours(23, 59, 59, 999);

                const { data: weeklyDeptData, error } = await supabase
                    .from('attendance')
                    .select('department_name, check_in_date')
                    .gte('check_in_date', startOfWeek.toISOString().split('T')[0])
                    .lte('check_in_date', endOfWeek.toISOString().split('T')[0]);

                if (error) throw error;

                // Count presents by department for the week
                const presentCounts = {};
                allDepartments.forEach(dept => {
                    presentCounts[dept] = 0;
                });

                weeklyDeptData?.forEach(record => {
                    if (record.department_name && presentCounts[record.department_name] !== undefined) {
                        presentCounts[record.department_name]++;
                    }
                });

                // Get total employees per department
                const { data: employees, error: empError } = await supabase
                    .from('employees')
                    .select('department');

                if (empError) throw empError;

                const totalCounts = {};
                allDepartments.forEach(dept => {
                    totalCounts[dept] = 0;
                });

                employees?.forEach(emp => {
                    if (emp.department && totalCounts[emp.department] !== undefined) {
                        totalCounts[emp.department]++;
                    }
                });

                // Calculate weekly totals (multiply daily average by 7)
                departmentStats = allDepartments.map(dept => {
                    const dailyPresent = (presentCounts[dept] || 0) / 7;
                    const weeklyPresent = Math.round(dailyPresent * 7);
                    const totalWeekly = (totalCounts[dept] || 0) * 7;
                    
                    return {
                        department: dept,
                        present: weeklyPresent,
                        total: totalWeekly,
                        absent: totalWeekly - weeklyPresent
                    };
                });
            }

            setAttendanceData(prev => ({
                ...prev,
                departmentData: departmentStats
            }));

        } catch (error) {
            console.error('Error fetching department data:', error);
            throw error;
        }
    };

    // Export to Excel function
    const exportToExcel = async () => {
        setExportLoading(true);
        try {
            // Create workbook
            const wb = XLSX.utils.book_new();
            
            // Summary Sheet
            const summaryData = [
                ['Attendance Summary Report'],
                [''],
                ['Report Type', filter === 'daily' ? 'Daily Report' : 'Weekly Report'],
                ['Date', selectedDate],
                ['Generated On', new Date().toLocaleString()],
                [''],
                ['Total Head Count', attendanceData.summary.totalHeadCount],
                ['Total Present', attendanceData.summary.totalPresent],
                ['Total Absent', attendanceData.summary.totalAbsent],
                ['Attendance Percentage', `${attendanceData.summary.attendancePercentage}%`]
            ];
            
            const summaryWS = XLSX.utils.aoa_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(wb, summaryWS, 'Summary');

            // Department Data Sheet
            const departmentData = [
                ['Department', 'Total Employees', 'Present', 'Absent', 'Attendance Rate'],
                ...attendanceData.departmentData.map(dept => [
                    dept.department,
                    dept.total,
                    dept.present,
                    dept.absent,
                    dept.total > 0 ? `${Math.round((dept.present / dept.total) * 100)}%` : '0%'
                ])
            ];
            
            const departmentWS = XLSX.utils.aoa_to_sheet(departmentData);
            XLSX.utils.book_append_sheet(wb, departmentWS, 'Department Data');

            // Detailed Attendance Sheet
            const detailedData = filter === 'daily' ? attendanceData.daily : attendanceData.weekly;
            if (detailedData && detailedData.length > 0) {
                const attendanceHeaders = Object.keys(detailedData[0]);
                const attendanceSheetData = [
                    attendanceHeaders,
                    ...detailedData.map(record => attendanceHeaders.map(header => record[header]))
                ];
                
                const attendanceWS = XLSX.utils.aoa_to_sheet(attendanceSheetData);
                XLSX.utils.book_append_sheet(wb, attendanceWS, 'Detailed Attendance');
            }

            // Generate filename
            const period = filter === 'daily' ? 'Daily' : 'Weekly';
            const fileName = `Attendance_Report_${period}_${selectedDate}.xlsx`;

            // Export the workbook
            XLSX.writeFile(wb, fileName);
            
        } catch (error) {
            console.error('Error exporting to Excel:', error);
            alert('Error exporting report. Please try again.');
        } finally {
            setExportLoading(false);
        }
    };

    // Get maximum value for chart scaling
    const getMaxDepartmentValue = () => {
        if (attendanceData.departmentData.length === 0) return 1;
        return Math.max(...attendanceData.departmentData.map(dept => 
            Math.max(dept.present, dept.absent)
        ), 1);
    };

    const maxDepartmentValue = getMaxDepartmentValue();

    return (
        <div className="dashboard-container">
            {/* Header */}
            <div className="dashboard-header">
                <h1>Morning Meeting Attendance Dashboard</h1>
                <div className="current-time">
                    {currentTime.toLocaleTimeString()} | {currentTime.toLocaleDateString()}
                </div>
            </div>

            {/* Controls and Summary Row */}
            <div className="controls-row">
                <div className="filters-container">
                    <div className="filter-group">
                        <label>View:</label>
                        <select 
                            value={filter} 
                            onChange={(e) => setFilter(e.target.value)}
                            className="filter-select"
                        >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                        </select>
                    </div>
                    
                    <div className="filter-group">
                        <label>Date:</label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="date-input"
                        />
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="summary-cards-row">
                    <div className="summary-card total">
                        <div className="card-icon">👥</div>
                        <div className="card-content">
                            <h3>Total Head Count</h3>
                            <span className="card-value">{attendanceData.summary.totalHeadCount}</span>
                        </div>
                    </div>
                    
                    <div className="summary-card present">
                        <div className="card-icon">✅</div>
                        <div className="card-content">
                            <h3>Total Present</h3>
                            <span className="card-value">{attendanceData.summary.totalPresent}</span>
                        </div>
                    </div>
                    
                    <div className="summary-card absent">
                        <div className="card-icon">❌</div>
                        <div className="card-content">
                            <h3>Total Absent</h3>
                            <span className="card-value">{attendanceData.summary.totalAbsent}</span>
                        </div>
                    </div>
                    
                    <div className="summary-card percentage">
                        <div className="card-icon">📊</div>
                        <div className="card-content">
                            <h3>Attendance %</h3>
                            <span className="card-value">{attendanceData.summary.attendancePercentage}%</span>
                        </div>
                    </div>
                </div>

                <div className="action-buttons">
                    <button 
                        onClick={fetchAttendanceData}
                        disabled={loading}
                        className="refresh-btn"
                    >
                        {loading ? <span className="loading-spinner"></span> : '🔄'}
                        {loading ? 'Refreshing...' : 'Refresh'}
                    </button>
                    
                    <button 
                        onClick={exportToExcel}
                        disabled={exportLoading || attendanceData.departmentData.length === 0}
                        className="export-btn"
                    >
                        {exportLoading ? <span className="loading-spinner"></span> : '📊'}
                        {exportLoading ? 'Exporting...' : 'Export Excel'}
                    </button>
                </div>
            </div>

            {/* Department Bar Chart */}
            <div className="department-chart-container">
                <h2>
                    Department-wise Attendance
                    <span className="chart-period">
                        {filter === 'daily' ? 
                            `for ${new Date(selectedDate).toLocaleDateString()}` : 
                            'Weekly Overview'
                        }
                    </span>
                </h2>
                
                <div className="department-chart">
                    {attendanceData.departmentData.length === 0 ? (
                        <div className="no-data">
                            <div className="icon">📊</div>
                            No department data available
                        </div>
                    ) : (
                        <>
                            <div className="chart-bars">
                                {attendanceData.departmentData.map((dept, index) => (
                                    <div key={dept.department} className="department-bar-container">
                                        <div className="department-label">
                                            {dept.department}
                                        </div>
                                        <div className="department-bar-wrapper">
                                            <div 
                                                className="department-bar present"
                                                style={{ 
                                                    height: `${(dept.present / maxDepartmentValue) * 100}%`,
                                                    opacity: dept.present > 0 ? 1 : 0.3
                                                }}
                                            >
                                                <span className="bar-count">{dept.present}</span>
                                            </div>
                                        </div>
                                        <div className="department-count">
                                            Present: {dept.present}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="chart-legend">
                                <div className="legend-item">
                                    <div className="legend-color present"></div>
                                    <span>Present Employees</span>
                                </div>
                                <div className="legend-item">
                                    <div className="legend-color absent"></div>
                                    <span>Absent Employees</span>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AttendanceDashboard;
