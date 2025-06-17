import React, { useState, useEffect } from "react";
import { Progress } from "antd";
import { useParams } from "react-router-dom";
import { ImportOutlined, ReloadOutlined, DownOutlined, EditOutlined, CloudUploadOutlined, CheckOutlined } from '@ant-design/icons';
import {
    Alert,
    Empty,
    Input,
    Button,
    Card,
    Space,
    message,
    Spin,
    Checkbox,
    Typography,
    Divider,
    Select,
    Row,
    Col,
    Modal
} from "antd";
import { UpOutlined } from "@ant-design/icons";
import axios from "axios";
import { io } from "socket.io-client";
 
const { Title, Text } = Typography;
const { Option } = Select;
 
const JiraEnhancementUI = () => {
    const [enhancements, setEnhancements] = useState([]);
    const [importedEnhancementIds, setImportedEnhancementIds] = useState([]);
    const [showImportedModal, setShowImportedModal] = useState(false);
    const {ticketId } = useParams();
    const [customPrompt, setCustomPrompt] = useState("");
    const [selectedEnhancements, setSelectedEnhancements] = useState([]);
    const [selectAll, setSelectAll] = useState(false);
    const [isEditingAll, setIsEditingAll] = useState(false);
    const [editedEnhancements, setEditedEnhancements] = useState([]);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState("Initializing...");
    const [error, setError] = useState(null);
    const [jiraProjectKey, setJiraProjectKey] = useState("RSOFT");
    const [importSuccessModal, setImportSuccessModal] = useState(false);
 
    const pageTheme = {
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        color: "#333"
    };
 
    useEffect(() => {
        setEditedEnhancements([...enhancements]);
    }, [enhancements]);
 
    useEffect(() => {
        const socket = io(`${process.env.REACT_APP_API_BASE_URL}`);
        socket.on("progress", (data) => {
            console.log("Progress Update:", data.message);
        });
        return () => socket.disconnect();
    }, []);
 
    useEffect(() => {
        if (ticketId) {
            fetchEnhancements();
        }
    }, [ticketId]);
 
    const fetchEnhancements = async (forceRegenerate = false) => {
        if (!ticketId) {
            message.warning("No Epic ticket ID provided.");
            return;
        }
        setLoading(true);
        try {
            let response;
            const baseURL = process.env.REACT_APP_API_BASE_URL;
            if (!baseURL) {
                message.error("Missing API base URL.");
                setLoading(false);
                return;
            }
            if (customPrompt.trim() !== "") {
                response = await axios.post(`${baseURL}/api/generate-enhancements`, {
                    ticketIds: [ticketId],
                    customPrompts: { [ticketId]: customPrompt }
                });
            } else {
                const url = `${baseURL}/api/enhancements/${ticketId}${forceRegenerate ? '?force=true' : ''}`;
                response = await axios.get(url);
            }
            const enhancementsData = response.data.enhancements || [];
            console.log('API Response:', response.data)
            setEnhancements(enhancementsData);
            message.success("Enhancements generated successfully!");
        } catch (error) {
            message.error("Failed to fetch enhancements.");
        } finally {
            setLoading(false);
        }
    };
 
    const importToJira = async () => {
        try {
            const total = selectedEnhancements.length;
            if (total === 0) {
                message.warning("Please select at least one enhancement to import.");
                return;
            }
            setImporting(true);
            setProgress(10);
            setProgressMessage("Starting import...");
            const response = await axios.post(`${process.env.REACT_APP_API_BASE_URL}/api/import-enhancements`, {
                enhancements: selectedEnhancements,
                projectKey: jiraProjectKey
            });
            if (response.data.success) {
                const ids = response.data.importedEnhancementIds;
                setImportedEnhancementIds(Array.isArray(ids) ? ids : []);
                setImportSuccessModal(true);
            } else {
                message.error("JIRA import failed.");
                setProgress(0);
                setProgressMessage("Import failed.");
            }
        } catch (error) {
            message.error("Failed to import enhancements to JIRA.");
            setProgress(0);
            setProgressMessage("Import failed.");
        } finally {
            setTimeout(() => {
                setImporting(false);
                setProgress(0);
                setProgressMessage("Initializing...");
            }, 1500);
        }
    };
 
    const toggleSelection = (enhancement) => {
        setSelectedEnhancements((prevSelected) =>
            prevSelected.includes(enhancement)
                ? prevSelected.filter((s) => s !== enhancement)
                : [...prevSelected, enhancement]
        );
    };
 
    const handleSelectAll = () => {
        setSelectAll(!selectAll);
        setSelectedEnhancements(selectAll ? [] : [...enhancements]);
    };
 
    const handleEditAll = () => {
        setIsEditingAll(true);
        setEditedEnhancements([...enhancements]);
    };
 
    const handleUpdateAll = () => {
        setEnhancements([...editedEnhancements]);
        setIsEditingAll(false);
        message.success("All enhancement details modified successfully!");
    };
 
    const handleFieldChange = (enhIndex, field, value) => {
        const updated = [...editedEnhancements];
        updated[enhIndex][field] = value;
        setEditedEnhancements(updated);
    };
 
    const scrollToTop = () =>
        window.scrollTo({ top: 0, behavior: "smooth" });
    const scrollToBottom = () =>
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
 
    const renderCustomPrompt = () => (
        <Card bordered={false} style={{ marginBottom: 24 }}>
            <Title level={5} style={{ marginBottom: 12 }}>Custom Prompt (Optional)</Title>
            <Input.TextArea
                placeholder="Type a custom prompt for Enhancement Generation..."
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={4}
                style={{
                    borderRadius: 4,
                    padding: 12,
                    backgroundColor: "#fafafa",
                    borderColor: "#d9d9d9",
                }}
            />
        </Card>
    );
 
    return (
        <div
            style={{
                ...pageTheme,
                background: "linear-gradient(135deg, #e6f7ff 0%, #ffffff 100%)",
                minHeight: "100vh",
                padding: 32,
            }}
        >
            {loading && (
                <div
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(255,255,255,0.7)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 2000,
                    }}
                >
                    <Spin size="large" tip="Generating enhancements..." />
                </div>
            )}
 
            {error && (
                <Alert
                    message="Error"
                    description={error}
                    type="error"
                    showIcon
                    style={{ marginBottom: 16 }}
                />
            )}
 
            <Card
                style={{
                    backgroundColor: "#1890ff",
                    color: "#fff",
                    marginBottom: 24,
                    borderRadius: 6,
                }}
                bodyStyle={{ padding: 20 }}
            >
                <Title level={3} style={{ color: "#fff", marginBottom: 0 }}>
                    RSOFT-JIRA EnhancementGen AI
                </Title>
                <Text style={{ color: "#e6f7ff", fontSize: 16 }}>
                    Generate and Import Enhancements
                </Text>
            </Card>
 
            <Card bordered={false} style={{ marginBottom: 24 }}>
                <Space direction="vertical" size="large" style={{ width: "100%" }}>
                    <div>
                        <Title level={4} style={{ marginBottom: 8, color: "#1890ff" }}>
                            Select JIRA Project
                        </Title>
                        <Select
                            value={jiraProjectKey}
                            style={{ width: 200 }}
                            onChange={(value) => setJiraProjectKey(value)}
                            placeholder="Choose a project"
                        >
                            <Option value="RSOFT">RSOFT</Option>
                            <Option value="COLLAPP">COLLAPP</Option>
                            <Option value="LCOPANELAP">LCOPANELAP</Option>
                            <Option value="MYC">MYC</Option>
                            <Option value="PAYTV">PAYTV</Option>
                        </Select>
                    </div>
                    {renderCustomPrompt()}
                </Space>
            </Card>
 
            <Row gutter={16} style={{ marginTop: 24, marginBottom: 16 }}>
                <Col span={5}>
                    <Button
                        type="primary"
                        block
                        icon={<ReloadOutlined />}
                        onClick={() => fetchEnhancements(true)}
                        disabled={loading}
                        aria-label="Re-generate enhancements"
                        style={{ color: '#1890ff', borderColor: '#1890ff', backgroundColor: '#fff' }}
                    >
                        <span style={{ marginLeft: 8 }}>Re-generate Enhancements</span>
                    </Button>
                </Col>
                <Col span={5}>
                    <Button
                        type="primary"
                        block
                        icon={<CloudUploadOutlined />}
                        onClick={importToJira}
                        loading={importing}
                        aria-label="Import enhancements to JIRA"
                        style={{ color: '#fff' }}
                    >
                        <span style={{ marginLeft: 8 }}>Import Enhancements to JIRA</span>
                    </Button>
                </Col>
            </Row>
            {importing && (
                <>
                    <Progress percent={progress} status="active" strokeColor="green" />
                    <Text style={{ textAlign: "center", display: "block", marginTop: "10px" }}>{progressMessage}</Text>
                </>
            )}
 
            <Text strong style={{ fontSize: "16px", color: "#1890ff", marginTop: "10px", marginRight: "10px" }}>
                Enhancements Count: {enhancements.length}
            </Text>
 
            {enhancements.length > 0 && (
                <Checkbox
                    checked={selectAll}
                    onChange={handleSelectAll}
                    style={{ alignSelf: "center" }}
                >
                    Select All
                </Checkbox>
            )}
 
            {/* Use isEditingAll for rendering Edit/Update All buttons */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                    <Button
                        type="primary"
                        icon={<EditOutlined />}
                        onClick={() => setIsEditingAll(true)}
                        disabled={isEditingAll}
                    >
                        Edit All
                    </Button>
                    <Button
                        type="primary"
                        icon={<CheckOutlined />}
                        onClick={handleUpdateAll}
                        style={{
                            backgroundColor: "#4CAF50",
                            borderColor: "#4CAF50",
                            marginLeft: 8
                        }}
                        disabled={!isEditingAll}
                    >
                        Update All
                    </Button>
                </div>
 
            <div className="enhancements-container">
                {enhancements.length > 0 ? (
                    <Row gutter={[16, 16]}>
                        {enhancements.map((enh, index) => (
                            <Col key={enh.enhancement_id} xs={24} sm={12}>
                                <Card
                                    hoverable
                                    style={{
                                        border: selectedEnhancements.includes(enh)
                                            ? "2px solid #1890ff"
                                            : "1px solid #f0f0f0",
                                        borderRadius: 8,
                                        height: "100%",
                                    }}
                                >
                                    <Row gutter={16}>
                                        <Col flex="40px">
                                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                                                <Checkbox
                                                    checked={selectedEnhancements.includes(enh)}
                                                    onChange={() => toggleSelection(enh)}
                                                >
                                                    Select
                                                </Checkbox>
                                            </div>
                                        </Col>
                                        <Col flex="auto">
                                            <Title level={5}>Enhancement Summary</Title>
                                            {isEditingAll ? (
                                                <Input.TextArea
                                                    value={editedEnhancements[index]?.summary || ""}
                                                    onChange={(e) =>
                                                        handleFieldChange(index, "summary", e.target.value)
                                                    }
                                                    autoSize={{ minRows: 2, maxRows: 4 }}
                                                />
                                            ) : (
                                                <Text>{enh.summary}</Text>
                                            )}
 
                                            <Title level={5} style={{ marginTop: 12 }}>
                                                Description
                                            </Title>
                                            {isEditingAll ? (
                                                <Input.TextArea
                                                    value={editedEnhancements[index]?.description || ""}
                                                    onChange={(e) =>
                                                        handleFieldChange(index, "description", e.target.value)
                                                    }
                                                    autoSize={{ minRows: 2, maxRows: 4 }}
                                                />
                                            ) : (
                                                <Text>{enh.description}</Text>
                                            )}
 
                                            <Divider style={{ marginTop: 12, marginBottom: 12 }} />
 
                                            <Title level={5}>i_want</Title>
                                            {isEditingAll ? (
                                                <Input.TextArea
                                                    value={editedEnhancements[index]?.i_want || ""}
                                                    onChange={(e) =>
                                                        handleFieldChange(index, "i_want", e.target.value)
                                                    }
                                                    style={{ marginBottom: 8 }}
                                                />
                                            ) : (
                                                <Text>{enh.i_want}</Text>
                                            )}
 
                                            <Title level={5}>so_that</Title>
                                            {isEditingAll ? (
                                                <Input.TextArea
                                                    value={editedEnhancements[index]?.so_that || ""}
                                                    onChange={(e) =>
                                                        handleFieldChange(index, "so_that", e.target.value)
                                                    }
                                                    style={{ marginBottom: 8 }}
                                                />
                                            ) : (
                                                <Text>{enh.so_that}</Text>                                            
                                            )}

                                            <Title level={5}>acceptance_criteria</Title>
                                            {isEditingAll ? (
                                                <Input.TextArea
                                                    value={editedEnhancements[index]?.acceptance_criteria || ""}
                                                    onChange={(e) =>
                                                        handleFieldChange(index, "acceptance_criteria", e.target.value)
                                                    }
                                                    style={{ marginBottom: 8 }}
                                                />
                                            ) : (
                                                <Text>{enh.acceptance_criteria}</Text>
                                            )}
                                        </Col>
                                    </Row>
                                </Card>
                            </Col>
                        ))}
                    </Row>
                ) : (
                    <Empty
                        description="No enhancements available."
                        style={{ marginTop: 40 }}
                    />
                )}
                <div style={{ position: "fixed", top: "20px", right: "20px", zIndex: 3000 }}>
                    <Button shape="circle" icon={<UpOutlined />} onClick={scrollToTop} />
                </div>
                <div style={{ position: "fixed", bottom: "20px", right: "20px", zIndex: 3000 }}>
                    <Button shape="circle" icon={<DownOutlined />} onClick={scrollToBottom} />
                </div>
 
                <Modal
                    open={importSuccessModal}
                    title="Import Successful"
                    onOk={() => setImportSuccessModal(false)}
                    onCancel={() => setImportSuccessModal(false)}
                    okText="OK"
                    cancelButtonProps={{ style: { display: "none" } }}
                >
                    <p><strong>✅ The following Enhancement IDs have been successfully imported:</strong></p>
                    <ul>
                        {(importedEnhancementIds || []).map((id) => (
                            <li key={id}>{id}</li>
                        ))}
                    </ul>
                </Modal>
            </div>
        </div>
    );
};
 
export default JiraEnhancementUI;