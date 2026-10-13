package com.agentscope.harness.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.ArrayList;
import java.util.List;

/**
 * 文件修改行级 Diff 模型。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class FileDiff {

    private String path;
    private String status; // modified, created, deleted
    private int additions;
    private int deletions;
    private List<DiffHunk> hunks = new ArrayList<>();
    private String beforeContent;
    private String afterContent;

    public static class DiffLine {
        private String type; // add, delete, normal
        private String text;
        private Integer oldLineNumber;
        private Integer newLineNumber;

        public DiffLine() {}

        public DiffLine(String type, String text, Integer oldLineNumber, Integer newLineNumber) {
            this.type = type;
            this.text = text;
            this.oldLineNumber = oldLineNumber;
            this.newLineNumber = newLineNumber;
        }

        public String getType() {
            return type;
        }

        public void setType(String type) {
            this.type = type;
        }

        public String getText() {
            return text;
        }

        public void setText(String text) {
            this.text = text;
        }

        public Integer getOldLineNumber() {
            return oldLineNumber;
        }

        public void setOldLineNumber(Integer oldLineNumber) {
            this.oldLineNumber = oldLineNumber;
        }

        public Integer getNewLineNumber() {
            return newLineNumber;
        }

        public void setNewLineNumber(Integer newLineNumber) {
            this.newLineNumber = newLineNumber;
        }
    }

    public static class DiffHunk {
        private String header;
        private List<DiffLine> lines = new ArrayList<>();

        public DiffHunk() {}

        public DiffHunk(String header, List<DiffLine> lines) {
            this.header = header;
            this.lines = lines;
        }

        public String getHeader() {
            return header;
        }

        public void setHeader(String header) {
            this.header = header;
        }

        public List<DiffLine> getLines() {
            return lines;
        }

        public void setLines(List<DiffLine> lines) {
            this.lines = lines;
        }
    }

    public FileDiff() {}

    public FileDiff(String path, String status, int additions, int deletions) {
        this.path = path;
        this.status = status;
        this.additions = additions;
        this.deletions = deletions;
    }

    public String getPath() {
        return path;
    }

    public void setPath(String path) {
        this.path = path;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public int getAdditions() {
        return additions;
    }

    public void setAdditions(int additions) {
        this.additions = additions;
    }

    public int getDeletions() {
        return deletions;
    }

    public void setDeletions(int deletions) {
        this.deletions = deletions;
    }

    public List<DiffHunk> getHunks() {
        return hunks;
    }

    public void setHunks(List<DiffHunk> hunks) {
        this.hunks = hunks;
    }

    public String getBeforeContent() {
        return beforeContent;
    }

    public void setBeforeContent(String beforeContent) {
        this.beforeContent = beforeContent;
    }

    public String getAfterContent() {
        return afterContent;
    }

    public void setAfterContent(String afterContent) {
        this.afterContent = afterContent;
    }
}
