import React, { useState, useEffect } from "react";
import { Progress } from "antd";
import { useParams, useLocation } from "react-router-dom";
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
    const location = useLocation();
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
 
    useEffect(() => {
        // Auto-select project based on route
        if (location.pathname.startsWith("/enhancements/")) {
            setJiraProjectKey("RSOFT");
        } else if (location.pathname.startsWith("/stories/")) {
            setJiraProjectKey("RSOFTBMS");
        }
    }, [location.pathname]);
 
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
            // Ensure correct endpoint and params for RSOFTBMS
            if (customPrompt.trim() !== "") {
                response = await axios.post(`${baseURL}/api/generate-enhancements`, {
                    ticketIds: [ticketId],
                    customPrompts: { [ticketId]: customPrompt },
                    projectKey: jiraProjectKey // Pass project key for backend to distinguish
                });
            } else {
                const url = `${baseURL}/api/enhancements/${ticketId}${forceRegenerate ? '?force=true' : ''}`;
                response = await axios.get(url, { params: { projectKey: jiraProjectKey } });
            }
            const enhancementsData = response.data.enhancements || response.data.stories || [];
            setEnhancements(enhancementsData);
            message.success(isBMS ? "Stories generated successfully!" : "Enhancements generated successfully!");
        } catch (error) {
            message.error(isBMS ? "Failed to fetch stories." : "Failed to fetch enhancements.");
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
            // Pass projectKey for backend to distinguish
            const response = await axios.post(`${process.env.REACT_APP_API_BASE_URL}/api/import-enhancements`, {
                enhancements: selectedEnhancements,
                projectKey: jiraProjectKey
            });
            if (response.data.success) {
                const ids = isBMS ? response.data.importedStoryIds : response.data.importedEnhancementIds;
                setImportedEnhancementIds(Array.isArray(ids) ? ids : []);
                setImportSuccessModal(true);
            } else {
                message.error(isBMS ? "JIRA story import failed." : "JIRA enhancement import failed.");
                setProgress(0);
                setProgressMessage("Import failed.");
            }
        } catch (error) {
            message.error(isBMS ? "Failed to import stories to JIRA." : "Failed to import enhancements to JIRA.");
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
 
    // Render fields based on project key
    const isBMS = jiraProjectKey === "RSOFTBMS";
 
    const extractPlainText = (value) => {
    if (typeof value === "string") return value;
 
    if (
        typeof value === "object" &&
        value !== null &&
        value.type === "doc" &&
        Array.isArray(value.content)
    ) {
        const extractFromContent = (contentArray) => {
            return contentArray
                .map(item => {
                    if (item.type === "text") return item.text;
                    if (item.content) return extractFromContent(item.content);
                    return '';
                })
                .join(' ');
        };
 
        return extractFromContent(value.content);
    }
 
    return "";
};
 
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
 
            {renderCustomPrompt()}
 
            <Row gutter={16} style={{ marginTop: 24, marginBottom: 16 }}>
                <Col span={5}>
                    <Button
                        type="primary"
                        block
                        icon={<ReloadOutlined />}
                        onClick={() => fetchEnhancements(true)}
                        disabled={loading}
                        aria-label={jiraProjectKey === "RSOFTBMS" ? "Re-generate stories" : "Re-generate enhancements"}
                        style={{ color: '#1890ff', borderColor: '#1890ff', backgroundColor: '#fff' }}
                    >
                        <span style={{ marginLeft: 8 }}>
                            {jiraProjectKey === "RSOFTBMS" ? "Re-generate Stories" : "Re-generate Enhancements"}
                        </span>
                    </Button>
                </Col>
                <Col span={5}>
                    <Button
                        type="primary"
                        block
                        icon={<CloudUploadOutlined />}
                        onClick={importToJira}
                        loading={importing}
                        aria-label={isBMS ? "Import stories to JIRA" : "Import enhancements to JIRA"}
                        style={{ color: '#fff' }}
                    >
                        <span style={{ marginLeft: 8 }}>{isBMS ? 'Import Stories to JIRA' : 'Import Enhancements to JIRA'}</span>
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
                {isBMS ? 'Stories' : 'Enhancements'} Count: {enhancements.length}
            </Text>
 
            {enhancements.length > 0 && (
                <Checkbox
                    checked={selectAll}
                    onChange={handleSelectAll}
                    style={{ alignSelf: "center" }}
                >
                    Select All {isBMS ? 'Stories' : 'Enhancements'}
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
                {enhancements && enhancements.length > 0 ? (
                    <Row gutter={[16, 16]}>
                        {enhancements.map((enh, index) => (
                            <Col key={isBMS ? enh.story_id : enh.enhancement_id} xs={24} sm={12}>
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
                                            {isBMS ? (
                                                <>
                                                    <Title level={5}>Summary</Title>
                                                    {isEditingAll ? (
                                                        <Input.TextArea
                                                            value={editedEnhancements[index]?.summary || ""}
                                                            onChange={(e) =>
                                                                handleFieldChange(index, "summary", e.target.value)
                                                            }
                                                            autoSize={{ minRows: 2, maxRows: 4 }}
                                                        />
                                                    ) : (
                                                        <Text>{extractPlainText(enh.summary)}</Text>
                                                    )}
                                                    <Title level={5}>User Story Summary</Title>
                                                    {isEditingAll ? (
                                                        <Input.TextArea
                                                            value={editedEnhancements[index]?.user_story_summary || ""}
                                                            onChange={(e) =>
                                                                handleFieldChange(index, "user_story_summary", e.target.value)
                                                            }
                                                            autoSize={{ minRows: 2, maxRows: 4 }}
                                                        />
                                                    ) : (
                                                        <Text>{extractPlainText(enh.user_story_summary)}</Text>
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
                                                        <Text>{extractPlainText(enh.description)}</Text>
                                                    )}
                                                    <Divider style={{ marginTop: 12, marginBottom: 12 }} />
                                                    <Title level={5}>Check Points</Title>
                                                    {isEditingAll ? (
                                                        <Input.TextArea
                                                            value={editedEnhancements[index]?.check_points || ""}
                                                            onChange={(e) =>
                                                                handleFieldChange(index, "check_points", e.target.value)
                                                            }
                                                            style={{ marginBottom: 8 }}
                                                        />
                                                    ) : (
                                                        <Text>{extractPlainText(enh.check_points)}</Text>
                                                    )}
                                                    <Title level={5}>Validations</Title>
                                                    {isEditingAll ? (
                                                        <Input.TextArea
                                                            value={editedEnhancements[index]?.validations || ""}
                                                            onChange={(e) =>
                                                                handleFieldChange(index, "validations", e.target.value)
                                                            }
                                                            style={{ marginBottom: 8 }}
                                                        />
                                                    ) : (
                                                        <Text>{extractPlainText(enh.validations)}</Text>
                                                    )}
                                                </>
                                            ) : (
                                                <>
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
                                                        <Text>{extractPlainText(enh.summary)}</Text>
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
                                                        <Text>{typeof enh.description === "string" ? enh.description : "Invalid description format"}</Text>
 
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
                                                        <Text>{extractPlainText(enh.i_want)}</Text>
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
                                                        <Text>{extractPlainText(enh.so_that)}</Text>                                            
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
                                                        <Text>{extractPlainText(enh.acceptance_criteria)}</Text>
                                                    )}
                                                </>
                                            )}
                                        </Col>
                                    </Row>
                                </Card>
                            </Col>
                        ))}
                    </Row>
                ) : (
                    <Empty
                        description={
                            <span>
                                No enhancements found. Generate new enhancements using the form above.
                            </span>
                        }
                        style={{ marginTop: 32 }}
                    />
                )}
            </div>
            <Modal
                visible={importSuccessModal}
                title={isBMS ? "Import Success (Stories)" : "Import Success (Enhancements)"}
                onCancel={() => setImportSuccessModal(false)}
                footer={[
                    <Button key="close" onClick={() => setImportSuccessModal(false)}>
                        Close
                    </Button>
                ]}
            >
                <p>
                    Successfully imported the following {isBMS ? 'stories' : 'enhancements'} to JIRA:
                </p>
                <ul>
                    {importedEnhancementIds?.map((id) => (
                        <li key={id}>
                            <a
                                href={
                                    isBMS
                                        ? `https://rsoftbms.atlassian.net/browse/${id}`
                                        : `https://reliablesoft.atlassian.net/browse/${id}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ textDecoration: 'underline' }}
                            >
                                <Text code>{id}</Text>
                            </a>
                        </li>
                    ))}
                </ul>
                <Button
                    type="link"
                    onClick={() => {
                        importedEnhancementIds.forEach((id) => {
                            const url = isBMS
                                ? `https://rsoftbms.atlassian.net/browse/${id}`
                                : `https://reliablesoft.atlassian.net/browse/${id}`;
                            window.open(url, '_blank', 'noopener,noreferrer');
                        });
                    }}
            >
                </Button>
            </Modal>
        </div>
    );
};
 
export default JiraEnhancementUI;